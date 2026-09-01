import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from './logger';

const log = logger('snapshot-store');

/**
 * Local store for bulk provider state that is too large for DynamoDB.
 *
 * The reminders fingerprint map is one entry per reminder; at ~90 bytes each a
 * library of a few thousand reminders blows past DynamoDB's hard 400KB item
 * limit, at which point every checkpoint write fails and the provider
 * republishes its entire library on every change. Bulk state therefore lives on
 * disk, and only a small summary goes to `sync_state`.
 *
 * The tradeoff is deliberate: this file only has to survive process restarts,
 * which is the case the checkpoint exists for. If the Mac is rebuilt the file is
 * gone and the provider republishes everything once — harmless, because ingest
 * is an idempotent upsert keyed on the Apple identifier.
 */
export class SnapshotStore {

    constructor(private readonly path: string) { }

    static forProvider(name: string) {
        return new SnapshotStore(join(homedir(), '.icloud-bridge', `${name}-snapshot.json`));
    }

    async read<T>(): Promise<T | undefined> {
        try {
            return JSON.parse(await readFile(this.path, 'utf-8')) as T;
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            // A corrupt file is recoverable: treat it as absent and rebuild from
            // the next snapshot rather than wedging the provider.
            log.warn(`Could not read ${this.path}; treating as empty`, e);
            return undefined;
        }
    }

    async write(value: unknown): Promise<void> {
        await mkdir(dirname(this.path), { recursive: true });
        // Written via a temp file and renamed so a crash mid-write cannot leave a
        // truncated checkpoint behind; rename is atomic within a filesystem.
        const temp = `${this.path}.tmp`;
        await writeFile(temp, JSON.stringify(value), 'utf-8');
        await rename(temp, this.path);
    }
}
