const DATABASE_ID = '1-jSEREZa8FacC-q-Fv96qN5ccRGh3M3pRSZFwjCSJbA';
const LEGO_SHEET_NAME = 'LEGO';
const LEGO_DATABASE = SpreadsheetApp.openById(DATABASE_ID).getSheetByName(LEGO_SHEET_NAME);

function doGet(e) {
    const setNumber = e.parameter.setNumber;
    console.log("Checking for ownership of: " + setNumber);

    var rows = LEGO_DATABASE.getDataRange().getValues();
    var headersSaved = false;
    var headers;

    for (let row of rows) {
        if (!headersSaved) {
            headers = row;
            headersSaved = true;
            continue;
        }

        if (row[0] == setNumber) {
            var stringed = JSON.stringify(toJson(headers, row));
            console.log(stringed);
            return ContentService.createTextOutput(stringed);
        }
    }
    const notFound = JSON.stringify({ owned: false });
    console.log(notFound);
    return ContentService.createTextOutput(notFound);
}

function toJson(headers, row) {
    var object = {
        "owned": true
    }
    for (let index in headers) {
        object[headers[index]] = row[index];
    }
    return object;
}