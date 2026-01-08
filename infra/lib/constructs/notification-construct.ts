import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IDependable } from 'constructs';

/**
 * Properties for NotificationConstruct
 */
export interface NotificationConstructProps {
  /**
   * Email address to receive deployment notifications.
   * This can be set via CDK context or environment variable.
   */
  readonly notificationEmail: string;

  /**
   * CloudFront distribution domain name for notification message.
   */
  readonly cloudfrontDomainName: string;

  /**
   * Resources that must complete before sending notification.
   * The custom resource will depend on these to ensure notification
   * is sent only after deployment is complete.
   */
  readonly deploymentDependencies: IDependable[];
}

/**
 * NotificationConstruct
 * 
 * Architectural Decision: Encapsulates deployment notification logic following ADR-005.
 * This construct manages SNS topic and custom resource to send notifications after
 * successful CDK deployments.
 * 
 * Key Design Choices:
 * - SNS for email notifications - reliable, scalable, and supports multiple protocols
 * - AwsCustomResource to trigger notification - executes after deployment completes
 * - Email subscription requires confirmation - security best practice
 * - Custom resource depends on deployment resources - ensures proper ordering
 * 
 * DX (Developer Experience) Improvement: Operators receive immediate feedback when
 * deployments complete, with a clickable link to the newly deployed application.
 * 
 * Cost Consideration: SNS is essentially free for low-volume email notifications.
 * First 1,000 email notifications per month are free, then $2 per 100,000 notifications.
 */
export class NotificationConstruct extends Construct {
  /**
   * Public property to expose the SNS topic.
   * This topic can be used for other deployment-related notifications.
   */
  public readonly topic: sns.Topic;

  /**
   * Public property to expose the custom resource.
   * This resource triggers the notification after deployment.
   */
  public readonly notificationResource: cr.AwsCustomResource;

  constructor(scope: Construct, id: string, props: NotificationConstructProps) {
    super(scope, id);

    /**
     * SNS Topic for deployment notifications.
     * Architectural Decision: Using a dedicated topic for deployment notifications
     * allows for flexible subscription management. Operators can subscribe via:
     * - Email (implemented here)
     * - SMS
     * - Lambda functions
     * - HTTP/HTTPS endpoints
     * - Mobile push notifications
     * 
     * DisplayName appears in email notifications, making them easy to identify.
     * 
     * Future Enhancement: Add tags for FinOps tracking if SNS notifications
     * become high-volume (unlikely for deployment notifications).
     */
    this.topic = new sns.Topic(this, 'Topic', {
      displayName: 'Serverless AI Image Tagger Deployment Notifications',
      topicName: 'DeploymentNotifications',
    });

    /**
     * Email subscription to the SNS topic.
     * Architectural Decision: Email subscriptions require confirmation by clicking
     * a link sent to the email address. This prevents spam and ensures only
     * authorized users receive notifications.
     * 
     * Important: The email address owner must click the confirmation link in the
     * email sent by AWS SNS before notifications will be delivered.
     * 
     * Security Note: The email address is provided via CDK context or environment
     * variable and should not be hardcoded in the source code.
     */
    this.topic.addSubscription(new subscriptions.EmailSubscription(props.notificationEmail));

    /**
     * AwsCustomResource to publish notification after deployment.
     * Architectural Decision: Using AwsCustomResource instead of a Lambda function
     * because it's simpler and requires no custom code. The custom resource:
     * 1. Executes during CloudFormation stack creation/update
     * 2. Makes AWS SDK calls (SNS:Publish in this case)
     * 3. Runs AFTER all dependencies are created
     * 
     * The custom resource is configured to run on CREATE and UPDATE, so notifications
     * are sent for both initial deployments and updates. This keeps operators informed
     * of all deployment activity.
     * 
     * onCreate and onUpdate are set to the same SDK call, ensuring consistent behavior.
     * No onDelete is defined because we don't need notifications when destroying the stack.
     */
    this.notificationResource = new cr.AwsCustomResource(this, 'NotificationResource', {
      onCreate: {
        service: 'SNS',
        action: 'publish',
        parameters: {
          TopicArn: this.topic.topicArn,
          Subject: 'Deployment Complete: Serverless AI Image Tagger',
          Message: [
            'The Serverless AI Image Tagger has been successfully deployed!',
            '',
            `🚀 Application URL: https://${props.cloudfrontDomainName}`,
            '',
            'You can now upload images and view AI-generated labels.',
            '',
            'Stack Details:',
            `- Stack Name: ${cdk.Stack.of(this).stackName}`,
            `- Region: ${cdk.Stack.of(this).region}`,
            `- Account: ${cdk.Stack.of(this).account}`,
            '',
            'This is an automated notification from AWS CloudFormation.',
          ].join('\n'),
        },
        /**
         * physicalResourceId: Defines a unique identifier for this custom resource.
         * Using timestamp ensures the resource is replaced (and thus re-executed)
         * on every deployment. This is crucial because we want a notification
         * for EVERY deployment, not just when the notification logic changes.
         * 
         * Alternative: Use PhysicalResourceId.of('notification') if you only want
         * notifications when the stack structure changes.
         */
        physicalResourceId: cr.PhysicalResourceId.of(`notification-${Date.now()}`),
      },
      onUpdate: {
        service: 'SNS',
        action: 'publish',
        parameters: {
          TopicArn: this.topic.topicArn,
          Subject: 'Deployment Update: Serverless AI Image Tagger',
          Message: [
            'The Serverless AI Image Tagger has been successfully updated!',
            '',
            `🚀 Application URL: https://${props.cloudfrontDomainName}`,
            '',
            'Changes have been deployed and are now live.',
            '',
            'Stack Details:',
            `- Stack Name: ${cdk.Stack.of(this).stackName}`,
            `- Region: ${cdk.Stack.of(this).region}`,
            `- Account: ${cdk.Stack.of(this).account}`,
            '',
            'This is an automated notification from AWS CloudFormation.',
          ].join('\n'),
        },
        physicalResourceId: cr.PhysicalResourceId.of(`notification-${Date.now()}`),
      },
      /**
       * IAM Policy for the custom resource Lambda function.
       * Architectural Decision: Grant only the minimum permissions required (SNS:Publish)
       * scoped to the specific topic. This follows the principle of least privilege.
       * 
       * The custom resource creates a Lambda function behind the scenes to execute
       * the AWS SDK calls. This policy grants that Lambda function permission to
       * publish to the SNS topic.
       */
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.topic.topicArn],
      }),
    });

    /**
     * Ensure the notification is sent AFTER deployment completes.
     * This is critical - we don't want to send "deployment complete" notifications
     * before the actual deployment finishes.
     * 
     * The custom resource depends on all deployment dependencies (BucketDeployment,
     * CloudFront distribution, etc.) to ensure proper ordering.
     */
    props.deploymentDependencies.forEach(dep => {
      this.notificationResource.node.addDependency(dep);
    });
  }
}
