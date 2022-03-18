import { NotificationApplication, sendPushNotification, Sound } from "../notifier";
import { startLambdaLog } from "../utilities/logging";

exports.handler = async (event: any = {}, context: any = {}) => {
    startLambdaLog(event, context, process.env);

    const pipelineEventString = event.Records[0].Sns.Message;
    console.log("PIPELINE EVENT\n" + pipelineEventString);

    const pipelineEvent = JSON.parse(pipelineEventString);

    let title;
    let body;
    let sound;
    if (pipelineEvent?.detail?.state === "SUCCEEDED") {
        title = "Pipeline Succeeded";
        body = pipelineEvent.detail.pipeline + " deployment succeeded";
        sound = Sound.INTERMISSION;
    } else {
        title = "Pipeline FAILED";
        body = "Pipeline: " + pipelineEvent.detail.pipeline + "\n" +
            "State: " + pipelineEvent.detail.state + "\n" +
            "Stage: " + pipelineEvent.detail.stage;
        sound = Sound.MECHANICAL;
    }

    await sendPushNotification(NotificationApplication.AWS, title, body, sound);
};

// exports.handler({
//     name: "2021, October 17th Auto X Powered by 425 Motorsports",
//     url: "https://evergreenspeedway.com/events/2021-october-17th-auto-x-powered-by-425-motorsports-2/",
//     registrationDate: 1633741200000
// });

/*

{
    "Records": [
        {
            "EventSource": "aws:sns",
            "EventVersion": "1.0",
            "EventSubscriptionArn": "arn:aws:sns:us-west-2:787068200846:CronLambdaPipelineNotificationTopic:4ce95f29-c303-455b-8a2d-7b8ba559daa9",
            "Sns": {
                "Type": "Notification",
                "MessageId": "154c3f2a-148e-5214-bf66-66cbae112a5b",
                "TopicArn": "arn:aws:sns:us-west-2:787068200846:CronLambdaPipelineNotificationTopic",
                "Subject": null,
                "Message": "{\"account\":\"787068200846\",\"detailType\":\"CodePipeline Pipeline Execution State Change\",\"region\":\"us-west-2\",\"source\":\"aws.codepipeline\",\"time\":\"2021-10-14T04:55:53Z\",\"notificationRuleArn\":\"arn:aws:codestar-notifications:us-west-2:787068200846:notificationrule/a591b4105f3efa7403f9e7a49ef93f096ff0c4f2\",\"detail\":{\"pipeline\":\"CronLambdasCDKPipeline\",\"execution-id\":\"87864de9-5bf8-4dc9-abe6-a27914a39aa8\",\"state\":\"SUCCEEDED\",\"version\":5.0},\"resources\":[\"arn:aws:codepipeline:us-west-2:787068200846:CronLambdasCDKPipeline\"],\"additionalAttributes\":{}}",
                "Timestamp": "2021-10-14T04:55:59.433Z",
                "SignatureVersion": "1",
                "Signature": "gi3Z0TdYQZEkxuqkAM7Hjw3pkg9L2kI6DEodHJa6pzj14ZQpz3YDTOMUkKNonyyPOlE0OsDE2l4CZ7BlzMZjRv4rB3BDfIQYNta061tUB7ZS6bHe2XTuc/VJbF2vYWF7cw6u+ClizWojEil4GnVN8UY6i9TFqD3eUSJ5EKBCjkmCNQkgjpYmmrHlkZD72DwfapBal2QiUQLj1JsuiI5J9ubHWi6F4sdEkk8a+/euLQF+NgoPZL/BrLRNKGra8iygtezsWi1agYOou9ckAGM7Vzb+zt/gR0K6BF7cyg4+fXdRdcFVA7grLfhaw6H3vJhWf0o+u7sbgsh3diKnybowkg==",
                "SigningCertUrl": "https://sns.us-west-2.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
                "UnsubscribeUrl": "https://sns.us-west-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-west-2:787068200846:CronLambdaPipelineNotificationTopic:4ce95f29-c303-455b-8a2d-7b8ba559daa9",
                "MessageAttributes": {}
            }
        }
    ]
}


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