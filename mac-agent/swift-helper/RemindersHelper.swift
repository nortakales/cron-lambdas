import EventKit
import Foundation

//
// reminders-helper — the EventKit half of the Reminders provider.
//
// EventKit is the only supported programmatic path to Reminders on macOS; the old
// CalDAV route is dead for migrated accounts. This binary is deliberately dumb:
// it reports what EventKit currently holds and applies single mutations. All
// diffing and all state lives in the Node agent, which already has durable
// storage in DynamoDB for its checkpoints.
//
// Two modes:
//   reminders-helper observe   long-running; prints an NDJSON snapshot on start
//                              and after every EKEventStoreChanged notification
//   reminders-helper exec      reads one JSON command from stdin, prints one JSON
//                              result to stdout, exits
//
// Written as a general EventKit bridge rather than a reminders-only tool, because
// Calendar rides the same framework and is the cheapest domain to add next.
//

// MARK: - JSON shapes

struct ReminderPayload: Codable {
    let reminderId: String
    let listId: String
    let listName: String
    let title: String
    let notes: String?
    let completed: Bool
    let completionDate: String?
    let dueDate: String?
    let startDate: String?
    let priority: Int
    let url: String?
    let creationDate: String?
    let appleLastModified: String?
    /// EventKit allows several rules per item, though Reminders.app sets at most one.
    let recurrence: [RecurrencePayload]?
}

/// A recurrence rule flattened into JSON. Mirrors EKRecurrenceRule closely enough
/// that a client can render "every 2 weeks on Monday" without EventKit.
struct RecurrencePayload: Codable {
    /// daily | weekly | monthly | yearly
    let frequency: String
    /// Every N periods; 1 for "every week".
    let interval: Int
    /// e.g. ["monday"], or ["+1monday"] / ["-1friday"] for "first"/"last" patterns.
    let daysOfTheWeek: [String]?
    let daysOfTheMonth: [Int]?
    let monthsOfTheYear: [Int]?
    let weeksOfTheYear: [Int]?
    let daysOfTheYear: [Int]?
    let setPositions: [Int]?
    /// Set when the series ends on a date.
    let endDate: String?
    /// Set when the series ends after a number of occurrences.
    let occurrenceCount: Int?
}

struct ListPayload: Codable {
    let listId: String
    let listName: String
    let isDefault: Bool
    /// Owning account, e.g. "iCloud" or "On My Mac".
    let sourceName: String
    /// True for a local-only list, which never syncs to other devices.
    let isLocal: Bool
}

struct Snapshot: Codable {
    let type: String
    let lists: [ListPayload]
    let reminders: [ReminderPayload]
    let capturedAt: String
}

struct CommandResult: Codable {
    let ok: Bool
    let data: [String: String]?
    let error: String?
}

// MARK: - Formatting

/// ISO8601 with fractional seconds in UTC, matching what the rest of the bridge
/// stores and what DynamoDB sorts lexicographically.
let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(identifier: "UTC")
    return formatter
}()

func iso(_ date: Date?) -> String? {
    guard let date = date else { return nil }
    return isoFormatter.string(from: date)
}

func parseDate(_ value: String?) -> Date? {
    guard let value = value else { return nil }
    if let date = isoFormatter.date(from: value) { return date }
    // Tolerate timestamps without fractional seconds.
    let fallback = ISO8601DateFormatter()
    fallback.formatOptions = [.withInternetDateTime]
    return fallback.date(from: value)
}

func emit<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(value),
          let line = String(data: data, encoding: .utf8) else {
        FileHandle.standardError.write("failed to encode output\n".data(using: .utf8)!)
        return
    }
    // One JSON object per line: the Node side reads this as NDJSON.
    print(line)
    fflush(stdout)
}

func fail(_ message: String) -> Never {
    emit(CommandResult(ok: false, data: nil, error: message))
    exit(1)
}

// MARK: - Access

/// Requests Reminders access, blocking until the user answers the TCC prompt.
///
/// macOS 14 replaced `requestAccess(to:)` with a full/write-only split. The old
/// call still functions on Sequoia but is the deprecated compatibility path, so
/// the new one is preferred whenever it is available.
func requestRemindersAccess(_ store: EKEventStore) -> Bool {
    var granted = false
    let semaphore = DispatchSemaphore(value: 0)

    if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { ok, _ in
            granted = ok
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .reminder) { ok, _ in
            granted = ok
            semaphore.signal()
        }
    }

    semaphore.wait()
    return granted
}

// MARK: - Reading

func serialize(_ reminder: EKReminder) -> ReminderPayload {
    // Reminders store dates as components, not instants, so they have to be
    // resolved through the calendar to get a real Date.
    let due = reminder.dueDateComponents.flatMap { Calendar.current.date(from: $0) }
    let start = reminder.startDateComponents.flatMap { Calendar.current.date(from: $0) }

    let rules = reminder.recurrenceRules?.map(serializeRecurrence)

    return ReminderPayload(
        reminderId: reminder.calendarItemIdentifier,
        listId: reminder.calendar.calendarIdentifier,
        listName: reminder.calendar.title,
        title: reminder.title ?? "",
        notes: reminder.notes,
        completed: reminder.isCompleted,
        completionDate: iso(reminder.completionDate),
        dueDate: iso(due),
        startDate: iso(start),
        priority: reminder.priority,
        url: reminder.url?.absoluteString,
        creationDate: iso(reminder.creationDate),
        appleLastModified: iso(reminder.lastModifiedDate),
        recurrence: (rules?.isEmpty ?? true) ? nil : rules
    )
}

let weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

func serializeRecurrence(_ rule: EKRecurrenceRule) -> RecurrencePayload {
    let frequency: String
    switch rule.frequency {
    case .daily: frequency = "daily"
    case .weekly: frequency = "weekly"
    case .monthly: frequency = "monthly"
    case .yearly: frequency = "yearly"
    @unknown default: frequency = "unknown"
    }

    // EKWeekday is 1-based from Sunday. A non-zero weekNumber means an ordinal
    // pattern such as "first Monday" (1) or "last Friday" (-1).
    let days = rule.daysOfTheWeek?.map { day -> String in
        let index = day.dayOfTheWeek.rawValue - 1
        let name = weekdayNames.indices.contains(index) ? weekdayNames[index] : "unknown"
        return day.weekNumber == 0 ? name : String(format: "%+d%@", day.weekNumber, name)
    }

    return RecurrencePayload(
        frequency: frequency,
        interval: rule.interval,
        daysOfTheWeek: days,
        daysOfTheMonth: rule.daysOfTheMonth?.map { $0.intValue },
        monthsOfTheYear: rule.monthsOfTheYear?.map { $0.intValue },
        weeksOfTheYear: rule.weeksOfTheYear?.map { $0.intValue },
        daysOfTheYear: rule.daysOfTheYear?.map { $0.intValue },
        setPositions: rule.setPositions?.map { $0.intValue },
        endDate: iso(rule.recurrenceEnd?.endDate),
        // EventKit reports 0 when the series ends on a date instead of a count.
        occurrenceCount: (rule.recurrenceEnd?.occurrenceCount).flatMap { $0 == 0 ? nil : $0 }
    )
}

func fetchAllReminders(_ store: EKEventStore, completion: @escaping ([EKReminder]) -> Void) {
    let calendars = store.calendars(for: .reminder)
    // A nil calendar list would mean "all", but passing them explicitly keeps the
    // behaviour identical whether or not a list was just added.
    let predicate = store.predicateForReminders(in: calendars)
    store.fetchReminders(matching: predicate) { reminders in
        completion(reminders ?? [])
    }
}

func captureSnapshot(_ store: EKEventStore, completion: @escaping (Snapshot) -> Void) {
    let defaultListId = store.defaultCalendarForNewReminders()?.calendarIdentifier

    let lists = store.calendars(for: .reminder).map { calendar -> ListPayload in
        let source = calendar.source
        return ListPayload(
            listId: calendar.calendarIdentifier,
            listName: calendar.title,
            isDefault: calendar.calendarIdentifier == defaultListId,
            sourceName: source?.title ?? "Unknown",
            // A local list exists only on this Mac; it is invisible on iPhone and
            // is a common source of "why is there a duplicate list?" confusion.
            isLocal: source?.sourceType == .local
        )
    }

    fetchAllReminders(store) { reminders in
        completion(Snapshot(
            type: "snapshot",
            lists: lists,
            reminders: reminders.map(serialize),
            capturedAt: isoFormatter.string(from: Date())
        ))
    }
}

// MARK: - Writing

func findReminder(_ store: EKEventStore, id: String) throws -> EKReminder {
    guard let item = store.calendarItem(withIdentifier: id) as? EKReminder else {
        throw HelperError.notFound("No reminder with id \(id)")
    }
    return item
}

func findList(_ store: EKEventStore, id: String?) throws -> EKCalendar {
    guard let id = id else {
        guard let fallback = store.defaultCalendarForNewReminders() else {
            throw HelperError.notFound("No default Reminders list is configured")
        }
        return fallback
    }
    guard let calendar = store.calendars(for: .reminder).first(where: { $0.calendarIdentifier == id }) else {
        throw HelperError.notFound("No Reminders list with id \(id)")
    }
    return calendar
}

enum HelperError: Error, LocalizedError {
    case notFound(String)
    case badRequest(String)

    var errorDescription: String? {
        switch self {
        case .notFound(let message), .badRequest(let message): return message
        }
    }
}

/// Applies the due date, where `nil` inside a present key means "clear it".
func applyDueDate(_ reminder: EKReminder, _ value: Any?) {
    guard let value = value else {
        reminder.dueDateComponents = nil
        return
    }
    guard let text = value as? String, let date = parseDate(text) else { return }
    reminder.dueDateComponents = Calendar.current.dateComponents(
        [.year, .month, .day, .hour, .minute, .second], from: date
    )
}

func execute(_ store: EKEventStore, _ command: [String: Any]) throws -> [String: String] {
    guard let action = command["action"] as? String else {
        throw HelperError.badRequest("Command is missing 'action'")
    }

    switch action {
    case "add":
        guard let title = command["title"] as? String, !title.isEmpty else {
            throw HelperError.badRequest("add requires a non-empty 'title'")
        }
        let reminder = EKReminder(eventStore: store)
        reminder.calendar = try findList(store, id: command["listId"] as? String)
        reminder.title = title
        if let notes = command["notes"] as? String { reminder.notes = notes }
        if let priority = command["priority"] as? Int { reminder.priority = priority }
        if command.keys.contains("dueDate") { applyDueDate(reminder, command["dueDate"]) }

        try store.save(reminder, commit: true)
        return [
            "reminderId": reminder.calendarItemIdentifier,
            "listId": reminder.calendar.calendarIdentifier,
        ]

    case "complete", "update":
        guard let reminderId = command["reminderId"] as? String else {
            throw HelperError.badRequest("\(action) requires 'reminderId'")
        }
        let reminder = try findReminder(store, id: reminderId)

        if let completed = command["completed"] as? Bool {
            reminder.isCompleted = completed
        }
        if let title = command["title"] as? String { reminder.title = title }
        if command.keys.contains("notes") { reminder.notes = command["notes"] as? String }
        if command.keys.contains("priority") { reminder.priority = (command["priority"] as? Int) ?? 0 }
        if command.keys.contains("dueDate") { applyDueDate(reminder, command["dueDate"]) }
        if let listId = command["listId"] as? String {
            reminder.calendar = try findList(store, id: listId)
        }

        try store.save(reminder, commit: true)
        return [
            "reminderId": reminder.calendarItemIdentifier,
            "listId": reminder.calendar.calendarIdentifier,
            "completed": String(reminder.isCompleted),
        ]

    default:
        throw HelperError.badRequest("Unknown action: \(action)")
    }
}

// MARK: - Modes

func runObserve(_ store: EKEventStore) {
    var pending: DispatchWorkItem?

    let publish = {
        captureSnapshot(store) { snapshot in emit(snapshot) }
    }

    // EventKit offers no change feed — only a coarse "something changed" signal,
    // often several in a burst — so changes are debounced into one snapshot.
    NotificationCenter.default.addObserver(
        forName: .EKEventStoreChanged,
        object: store,
        queue: .main
    ) { _ in
        pending?.cancel()
        let work = DispatchWorkItem { publish() }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
    }

    publish()
    RunLoop.main.run()
}

func runExec(_ store: EKEventStore) {
    let input = FileHandle.standardInput.readDataToEndOfFile()

    guard let parsed = try? JSONSerialization.jsonObject(with: input),
          let command = parsed as? [String: Any] else {
        fail("stdin was not a JSON object")
    }

    if command["action"] as? String == "snapshot" {
        let semaphore = DispatchSemaphore(value: 0)
        captureSnapshot(store) { snapshot in
            emit(snapshot)
            semaphore.signal()
        }
        semaphore.wait()
        return
    }

    do {
        let data = try execute(store, command)
        emit(CommandResult(ok: true, data: data, error: nil))
    } catch {
        fail(error.localizedDescription)
    }
}

// MARK: - Entry point

let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let store = EKEventStore()

guard requestRemindersAccess(store) else {
    fail("Reminders access was denied. Grant it in System Settings > Privacy & Security > Reminders.")
}

switch mode {
case "observe": runObserve(store)
case "exec": runExec(store)
default:
    fail("Usage: reminders-helper <observe|exec>")
}
