import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as nodejslambda from '@aws-cdk/aws-lambda-nodejs';
import * as iam from '@aws-cdk/aws-iam';
import * as sqs from '@aws-cdk/aws-sqs';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as actions from '@aws-cdk/aws-cloudwatch-actions';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';

export interface DLQWithMonitorProps {
    notificationEmail: string;
    topicDisplayName: string;
    dlqRetentionPeriod?: cdk.Duration;
    alarmThreshold?: number;
    alarmEvaluationPeriods?: number;
    alarmComparisonOperator?: cloudwatch.ComparisonOperator;
}

export class DLQWithMonitor extends cdk.Construct {

    readonly dlq: sqs.Queue;

    constructor(scope: cdk.Construct, idPrefix: string, props: DLQWithMonitorProps) {
        super(scope, idPrefix + '-DLQWithMonitor');

        // Use defaults if needed
        props.dlqRetentionPeriod = props.dlqRetentionPeriod || cdk.Duration.days(14);
        props.alarmThreshold = props.alarmThreshold || 1;
        props.alarmEvaluationPeriods = props.alarmEvaluationPeriods || 1;
        props.alarmComparisonOperator = props.alarmComparisonOperator || cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;

        const dlqId = idPrefix + '-DLQ';
        const alarmId = dlqId + '-Monitor'
        const snsTopicId = alarmId + '-Topic';

        const snsTopic = new sns.Topic(this, snsTopicId, {
            topicName: snsTopicId,
            displayName: props.topicDisplayName,
        });
        snsTopic.addSubscription(new subscriptions.EmailSubscription(props.notificationEmail));

        this.dlq = new sqs.Queue(this, dlqId, {
            queueName: dlqId,
            retentionPeriod: props.dlqRetentionPeriod,
        });

        const alarm = this.dlq.metricApproximateNumberOfMessagesVisible().createAlarm(this, alarmId, {
            alarmName: alarmId,
            alarmDescription: 'Monitor for messages in DLQ: ' + dlqId,
            threshold: props.alarmThreshold,
            evaluationPeriods: props.alarmEvaluationPeriods,
            comparisonOperator: props.alarmComparisonOperator,
        });
        alarm.addAlarmAction(new actions.SnsAction(snsTopic));
    }
}
