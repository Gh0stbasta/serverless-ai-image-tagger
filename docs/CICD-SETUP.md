# CI/CD Setup Guide

This document explains how to configure GitHub Actions for automated deployment to AWS.

## Overview

The deploy workflow (`.github/workflows/deploy.yml`) automatically deploys infrastructure changes to AWS when code is pushed to the `main` branch.

## Required GitHub Configuration

### Secrets

The following secrets must be configured in your GitHub repository settings (Settings → Secrets and variables → Actions):

1. **`AWS_ROLE_ARN`** (Secret)
   - Description: The ARN of the IAM role that GitHub Actions will assume using OIDC
   - Format: `arn:aws:iam::{ACCOUNT_ID}:role/{ROLE_NAME}`
   - Example: `arn:aws:iam::123456789012:role/GitHubActionsDeployRole`

2. **`AWS_ACCOUNT_ID`** (Secret)
   - Description: Your AWS Account ID
   - Format: 12-digit number
   - Example: `123456789012`

### Variables

The following variables can be configured in your GitHub repository settings (Settings → Secrets and variables → Actions → Variables):

1. **`AWS_REGION`** (Variable, Optional)
   - Description: The AWS region to deploy to
   - Default: `us-east-1`
   - Example: `us-east-1`, `eu-west-1`, etc.

## AWS OIDC Configuration

To use OIDC authentication (recommended over long-lived access keys), you need to:

1. **Create an OIDC Identity Provider in AWS IAM**
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`

2. **Create an IAM Role for GitHub Actions**
   - Trust policy should allow the GitHub OIDC provider
   - Attach policies that grant necessary permissions for CDK deployment

### Example Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::{ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:Gh0stbasta/serverless-ai-image-tagger:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

### Required IAM Permissions

The IAM role needs permissions to deploy CDK stacks. At minimum, it should have:

- CloudFormation full access (to create/update stacks)
- S3 access (for CDK bootstrap bucket)
- IAM permissions (to create roles for Lambda, etc.)
- Lambda, DynamoDB, API Gateway, Rekognition permissions (for the specific resources being deployed)

**Recommendation:** Start with `AdministratorAccess` for initial setup, then refine to least-privilege permissions based on your specific stack requirements.

## Workflow Behavior

### Trigger

- The workflow triggers on every push to the `main` branch
- Pull requests do not trigger deployment (only when merged to main)

### Steps

1. **Checkout code**: Checks out the repository code
2. **Setup Node.js**: Installs Node.js 20.x with npm caching
3. **Configure AWS Credentials**: Assumes the IAM role via OIDC
4. **Install dependencies**: Runs `npm ci` to install root dependencies
5. **Install infrastructure dependencies**: Runs `npm ci --prefix infra` to install CDK dependencies
6. **Deploy with CDK**: Runs `cdk deploy --require-approval never --all` to deploy infrastructure

### Environment Variables

The workflow sets the following environment variables for CDK:
- `CDK_DEFAULT_ACCOUNT`: Set to the AWS Account ID from secrets
- `CDK_DEFAULT_REGION`: Set to the AWS Region from variables (or defaults to `us-east-1`)

## Security Considerations

- **OIDC vs Access Keys**: This workflow uses OIDC authentication, which is more secure than long-lived AWS access keys
- **Least Privilege**: The IAM role should follow the principle of least privilege
- **Branch Protection**: Consider requiring pull request reviews before merging to `main` to prevent unauthorized deployments
- **Secret Scanning**: Enable GitHub secret scanning to detect accidentally committed credentials

## Troubleshooting

### "Error: Credentials could not be loaded"
- Verify `AWS_ROLE_ARN` is correctly set in GitHub Secrets
- Verify the OIDC provider is correctly configured in AWS IAM
- Check the IAM role's trust policy allows your repository

### "Error: User is not authorized to perform: sts:AssumeRoleWithWebIdentity"
- Check the trust policy condition matches your repository and branch
- Verify the OIDC provider is registered in your AWS account

### CDK deployment fails with permission errors
- Review the IAM policies attached to the GitHub Actions role
- Ensure the role has sufficient permissions for all resources being deployed

## References

- [GitHub Actions OIDC with AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/latest/guide/home.html)
- [Configuring AWS Credentials Action](https://github.com/aws-actions/configure-aws-credentials)
