'use strict';

const AWS = require('aws-sdk');
const HTTPS = require('https');

const EMAIL_LIST = process.env.emailList;
const SUBJECT = process.env.subject;
const FROM = process.env.from;
const TABLE_NAME = process.env.tableName;

AWS.config.update({ region: 'us-west-2' });

const SES = new AWS.SES({ region: "us-west-2" });
const DDB = new AWS.DynamoDB({ region: "us-west-2" });

async function getUrlFromDDB(url) {

  var params = {
    TableName: TABLE_NAME,
    Key: {
      'url': { S: url }
    }
  };

  // Call DynamoDB to read the item from the table
  const request = await DDB.getItem(params, function (err, data) {
    if (err) {
      console.log("DDB Error", err);
    } else {
      return data.Item;
    }
  });

  const result = await request.promise();
  return result.Item;
}

async function writeUrlToDDB(url, name) {

  var params = {
    TableName: TABLE_NAME,
    Item: {
      'url': { S: url },
      'name': { S: name }
    }
  };

  console.log("Writing URL to DDB: " + url + " " + name);

  const request = await DDB.putItem(params, function (err, data) {
    if (err) {
      console.log("DDB Error", err);
    } else {
      return data.Item;
    }
  });

  const result = await request.promise();
  return result.Item;
}

function parseSchedulePageForNewUrls(html) {
  console.log("Parsing HTML");

  html = html.replace(/\s+/g, " ");
  const allUrls = html.matchAll(/<a href="(.*?)">(.*?)<\/a>/gi);

  let processedUrls = {};
  let newUrls = [];

  // For every URL on the page
  for (const url of allUrls) {
    if (processedUrls[url[1]])
      continue;
    processedUrls[url[1]] = true;
    // Only look at those containing some variation of "autocross"
    if (url[0].match(/auto\s*(x|cross)/i)) {
      console.log("Found " + url[1] + " " + url[2]);
      processedUrls[url[1]] = true;
      newUrls.push(
        getUrlFromDDB(url[1])
          .then((item) => {
            if (item == null) {
              console.log("NEW " + url[1] + " " + url[2]);
              return url;
            } else {
              return null;
            }
          })
          .then((url) => {
            if (url == null) {
              return null;
            } else {
              return writeUrlToDDB(url[1], url[2]).then(() => {
                return url

              });
            }
          })
      );
    }
  }

  return Promise.all(newUrls);
}

function httpsGet(url) {

  console.log("Getting " + url);

  return new Promise(function (resolve, reject) {

    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };

    var request = HTTPS.get(url, options, (response) => {

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error('statusCode=' + response.statusCode));
      }

      let data = '';

      response.on('data', (chunk) => {
        console.log("Retrieving data");
        data += chunk;
      });

      response.on('end', () => {
        console.log("Ended data transfer");
        resolve(data);
      });

    }).on("error", (err) => {
      console.log("Error: " + err.message);
      reject(err.message);
    });

    request.end();
  });
}

function sendEmail(urls) {

  console.log("Sending email");

  let emailBody = "New AutoX discovered:\n";
  let allNull = true;
  for (let url of urls) {
    if (url != null) {
      allNull = false;
      emailBody += url[2] + "\n" + url[1] + "\n\n";
    }
  }

  if (allNull) {
    console.log("No email to send");
    return;
  }

  console.log("Email body: ");
  console.log(emailBody);

  var params = {
    Destination: {
      ToAddresses: EMAIL_LIST.split(","),
    },
    Message: {
      Body: {
        Text: { Data: emailBody },
      },

      Subject: { Data: SUBJECT },
    },
    Source: FROM,
  };

  return SES.sendEmail(params).promise();
}

exports.handler = async function (event) {

  return httpsGet("https://evergreenspeedway.com/schedule/")
    .then((html) => { return parseSchedulePageForNewUrls(html); })
    .then((urls) => sendEmail(urls));
};
