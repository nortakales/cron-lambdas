# Lambda Crons

## AutoX Reminder

Runs once per hour and scrapes for any new Evergreen AutoX URLs. When new URLs are found, emails a list of people.

TODO: another good global install to add is `npm install -g ts-node`

TODO: Is there anything from SES I can get into CDK? I manually set that config up I think

Had to upgrade deps to use nodejs lambda, then got crazy cryptic docker error, eventually had to `npm install --save-dev esbuild@0` to use esbuild instead, found that here: https://pypi.org/project/aws-cdk.aws-lambda-nodejs/