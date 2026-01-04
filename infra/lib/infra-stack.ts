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
    new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      /**
       * Thumbprint for GitHub's OIDC provider.
       * This is a well-known, stable value provided by GitHub.
       * See: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
       */
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });
  }
}
