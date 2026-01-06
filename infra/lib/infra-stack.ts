import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * OpenID Connect Provider for GitHub Actions.
     * Architectural Decision: Using OIDC instead of long-lived AWS Access Keys
     * improves security by providing temporary credentials that are automatically
     * rotated and scoped to specific GitHub repositories/branches.
     * 
     * The thumbprint is GitHub's OIDC provider certificate thumbprint.
     * This allows GitHub Actions workflows to assume AWS IAM roles without
     * storing static credentials, following AWS security best practices.
     */
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      /**
       * Thumbprint for GitHub's OIDC provider.
       * This is a well-known, stable value provided by GitHub.
       * Verified: 2024-01-04
       * See: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
       * Note: GitHub maintains this thumbprint and notifies of changes. Periodic verification recommended.
       */
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    /**
     * IAM Role for GitHub Actions to deploy CDK stack.
     * Architectural Decision: The role uses a trust policy that restricts access
     * to only this specific GitHub repository using OIDC federation.
     * This ensures that only workflows from 'Gh0stbasta/serverless-ai-image-tagger'
     * can assume this role, following the principle of least privilege.
     * 
     * The StringLike condition with wildcard allows any branch/tag in the repo
     * while still preventing access from other repositories or GitHub accounts.
     */
    const githubDeployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'GitHubActionsDeployRole',
      description: 'IAM Role for GitHub Actions to deploy the serverless-ai-image-tagger CDK stack',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringLike: {
            'token.actions.githubusercontent.com:sub': 'repo:Gh0stbasta/serverless-ai-image-tagger:*',
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        }
      ),
      /**
       * Using AdministratorAccess for initial setup.
       * TODO: In production, replace with granular CDK deployment permissions:
       * - cloudformation:*
       * - iam:PassRole (scoped to CDK execution role)
       * - s3:* (scoped to CDK staging bucket)
       * - lambda:*, dynamodb:*, rekognition:*, etc. (based on stack resources)
       * 
       * Rationale: AdministratorAccess allows rapid prototyping and ensures
       * CDK can create/modify any resource during development phase.
       * This should be refined before production deployment.
       */
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    // Output the role ARN for use in GitHub Actions workflow configuration
    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', {
      value: githubDeployRole.roleArn,
      description: 'ARN of the IAM role for GitHub Actions deployment',
      exportName: 'GitHubActionsDeployRoleArn',
    });
  }
}
