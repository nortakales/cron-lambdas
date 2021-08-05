import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';

export class CronLambdaStack extends cdk.Stack {
  /*
    public readonly hcViewerUrl: cdk.CfnOutput;
    public readonly hcEndpoint: cdk.CfnOutput;
  */
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const autoxReminder = new lambda.Function(this, 'AutoxReminderLambda', {
      functionName: 'AutoxReminderLambda',
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'autox-reminder.handler',
    });

    /*
        this.hcEndpoint = new cdk.CfnOutput(this, 'GatewayUrl', {
          value: gateway.url
        });
    
        this.hcViewerUrl = new cdk.CfnOutput(this, 'TableViewerUrl', {
          value: tableViewer.endpoint
        });*/
  }
}
