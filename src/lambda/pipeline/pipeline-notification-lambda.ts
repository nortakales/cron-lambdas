import { NotificationApplication, sendPushNotification } from "../notifier";

exports.handler = async (event: any = {}, context: any = {}) => {
    console.log("Running...");

    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(process.env, null, 2));

    let title;
    let body;
    if (event?.detail?.state === "SUCCESS") {
        title = "Pipeline Succeeded";
        body = event.detail.pipeline + " deployment succeeded";
    } else {
        title = "Pipeline FAILED";
        body = "Pipeline: " + event.detail.pipeline + "\n" +
            "State: " + event.detail.state + "\n" +
            "Stage: " + event.detail.stage;

    }

    await sendPushNotification(NotificationApplication.AWS, title, body);

    console.log("Done");
};

// exports.handler({
//     name: "2021, October 17th Auto X Powered by 425 Motorsports",
//     url: "https://evergreenspeedway.com/events/2021-october-17th-auto-x-powered-by-425-motorsports-2/",
//     registrationDate: 1633741200000
// });


/*

{
    "account": "787068200846",
    "detailType": "CodePipeline Stage Execution State Change",
    "region": "us-west-2",
    "source": "aws.codepipeline",
    "time": "2021-10-13T04:32:15Z",
    "notificationRuleArn": "arn:aws:codestar-notifications:us-west-2:787068200846:notificationrule/a591b4105f3efa7403f9e7a49ef93f096ff0c4f2",
    "detail": {
        "pipeline": "CronLambdasCDKPipeline",
        "execution-id": "936afa0e-1cf5-4c33-89d2-f8dfbac9a21d",
        "state": "FAILED",
        "stage": "DeployCronLambdaStage",
        "version": 5
    },
    "resources": [
        "arn:aws:codepipeline:us-west-2:787068200846:CronLambdasCDKPipeline"
    ],
    "additionalAttributes": {
        "failedActionCount": 1,
        "failedActions": [
            {
                "action": "CronLambdaStack.Deploy",
                "additionalInformation": "Failed to execute change set. Current stack status: UPDATE_ROLLBACK_COMPLETE. Reason: No reason was provided."
            }
        ]
    }
}
{
    "account": "787068200846",
    "detailType": "CodePipeline Pipeline Execution State Change",
    "region": "us-west-2",
    "source": "aws.codepipeline",
    "time": "2021-10-07T04:41:15Z",
    "notificationRuleArn": "arn:aws:codestar-notifications:us-west-2:787068200846:notificationrule/a591b4105f3efa7403f9e7a49ef93f096ff0c4f2",
    "detail": {
        "pipeline": "CronLambdasCDKPipeline",
        "execution-id": "15a7a1d8-3795-4613-8b07-75214430098d",
        "state": "SUCCEEDED",
        "version": 3
    },
    "resources": [
        "arn:aws:codepipeline:us-west-2:787068200846:CronLambdasCDKPipeline"
    ],
    "additionalAttributes": {}
}

*/