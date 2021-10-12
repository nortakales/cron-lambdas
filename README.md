# Lambda Crons

## AutoX Reminder

Runs once per hour and scrapes for any new Evergreen AutoX URLs. When new URLs are found, emails a list of people.

TODO: another good global install to add is `npm install -g ts-node`

TODO: Is there anything from SES I can get into CDK? I manually set that config up I think - this might be used across many things though

Had to upgrade deps to use nodejs lambda, then got crazy cryptic docker error, eventually had to `npm install --save-dev esbuild@0` to use esbuild instead, found that here: https://pypi.org/project/aws-cdk.aws-lambda-nodejs/

## Weather Reminder

TODO More reminders:
* heavy rainfall (this might need to be hourly or maybe even can look at minute data to get true downpours)
* First below freezing (at night) temp of the year
* snowfall
* heat waves
* Using historical data:
  * record temps
  * record rainfall
  * record snowfall
  * record wind
  * record humidity
* Are there any gaps where I should maybe notify on a quicker basis, like if the last 48 hour alert the wind didn't look too bad, but in the next few hours it did start to get bad, maybe a 3 hour look ahead for bad weather
* Use feels like temperature for anything?
* do we care about sunrise/sunset, moonphase?
* use alerts from their API
* weekly forecast ? - this would really benefit from averaging across different sources

TODO move all of this out of my main aws account
TODO use DLQs for lambda, trigger monitors on DLQ, this seems like the only way to get alarms AFTER retries
TODO some kind of push notification when pipeline has finished?