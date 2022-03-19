
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from 'constructs';

export class AdhocWeatherReportAPI extends Construct {

    constructor(scope: Construct, id: string, lambda: lambda.Function) {
        super(scope, id);

        const api = new apigateway.RestApi(this, id + "-AdhocAPI", {
            restApiName: "Adhoc Weather Report",
            description: "Generates an adhoc weather report.",
            deployOptions: {
                metricsEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: true
            }
        });

        const integration = new apigateway.LambdaIntegration(lambda, {
            requestTemplates: {
                "application/json": '{ "statusCode": "200" }'
            }
        });

        api.root.addMethod("GET", integration);
    }
}