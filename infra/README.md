# Serverless AI Image Tagger - Infrastructure

This CDK project defines the infrastructure for the Serverless AI Image Tagger application using AWS CDK v2 with TypeScript.

## Architecture Components

### GitHub Actions OIDC Integration

This stack includes an IAM role configured for secure GitHub Actions deployment using OpenID Connect (OIDC):

- **OIDC Provider**: Enables GitHub Actions to authenticate with AWS without long-lived credentials
- **GitHubActionsDeployRole**: IAM role that can be assumed by GitHub Actions workflows from this repository

#### Using the Deploy Role in GitHub Actions

After deploying this stack, you can use the created role in your GitHub Actions workflows:

```yaml
name: Deploy CDK Stack

on:
  push:
    branches: [main]

permissions:
  id-token: write   # Required for OIDC authentication
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::<AWS_ACCOUNT_ID>:role/GitHubActionsDeployRole
          aws-region: us-east-1
      
      - name: Deploy CDK Stack
        run: |
          cd infra
          npm install
          npm run deploy
```

**Security Note**: The role is restricted to this repository (`Gh0stbasta/serverless-ai-image-tagger`) via the trust policy condition. Only workflows running in this repository can assume the role.

## Useful commands

* `npm run build`   - Compile TypeScript to JavaScript
* `npm run watch`   - Watch for changes and compile
* `npm run test`    - Run Jest unit tests
* `npm run synth`   - Emit the synthesized CloudFormation template
* `npm run deploy`  - Deploy this stack to your default AWS account/region
* `npm run diff`    - Compare deployed stack with current state
* `npm run destroy` - Destroy the deployed stack

## Deployment

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

3. **Deploy to AWS**:
   ```bash
   npm run deploy
   ```

4. **Get the Role ARN** (needed for GitHub Actions):
   After deployment, the CloudFormation output `GitHubDeployRoleArn` will contain the ARN of the deployment role.

## Testing

Run the test suite:
```bash
npm test
```

The tests verify:
- FinOps tags are properly applied
- OIDC Provider is configured correctly
- GitHub Deploy Role has the correct trust policy
- CloudFormation outputs are exported

## Security Considerations

- **OIDC Authentication**: Uses temporary credentials instead of long-lived access keys
- **Repository Scoping**: The deploy role can only be assumed by workflows from this specific repository
- **Least Privilege**: Currently uses AdministratorAccess for development; should be replaced with granular permissions for production
- **Audience Verification**: Additional check that the token is intended for AWS STS
