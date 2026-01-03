# DevContainer Verification Guide

This document provides steps to verify that the DevContainer is configured correctly and meets the acceptance criteria.

## Prerequisites
- Visual Studio Code installed
- Docker Desktop installed and running
- Remote - Containers extension installed in VS Code

## Verification Steps

### 1. Open Project in DevContainer

1. Open the repository folder in VS Code
2. VS Code should detect the `.devcontainer/devcontainer.json` file
3. Click "Reopen in Container" when prompted (or use Command Palette: "Remote-Containers: Reopen in Container")
4. Wait for the container to build and start (first time may take a few minutes)

### 2. Verify AWS CLI Installation

Once the container is running, open the integrated terminal and run:

```bash
aws --version
```

**Expected Output:** Should display AWS CLI version 2.x or higher
```
aws-cli/2.x.x Python/3.x.x Linux/x.x.x-xxx botocore/2.x.x
```

### 3. Verify AWS CDK Installation

In the integrated terminal, run:

```bash
cdk --version
```

**Expected Output:** Should display CDK version (pre-installed in the universal image)
```
2.x.x (build xxxxxxx)
```

If CDK is not installed, you can install it globally with:
```bash
npm install -g aws-cdk
```

### 4. Verify Node.js Installation

Check Node.js version:

```bash
node --version
```

**Expected Output:** Should display Node.js 20.x or higher
```
v20.x.x
```

### 5. Verify VS Code Extensions

Check that the following extensions are installed in the container:
- Material Icon Theme (PKief.material-icon-theme)
- GitHub Copilot (GitHub.copilot)
- GitHub Copilot Chat (GitHub.copilot-chat)
- Python (ms-python.python)
- Pylance (ms-python.vscode-pylance)
- Python Debugger (ms-python.debugpy)
- Prettier (esbenp.prettier-vscode)
- Prettier ESLint (rvest.vs-code-prettier-eslint)
- ESLint (dbaeumer.vscode-eslint)
- Live Server (ms-vscode.live-server)
- Node Module IntelliSense (leizongmin.node-module-intellisense)
- SQLite Viewer (qwtel.sqlite-viewer)

You can verify this by:
1. Opening the Extensions view (Ctrl+Shift+X or Cmd+Shift+X)
2. Checking that the extensions listed above are installed

### 6. Verify VS Code Settings

Check that the workspace is using:
- **Icon Theme:** Material Icon Theme
- **Color Theme:** Default Dark Modern

You can verify this in:
- File > Preferences > Color Theme (should show "Default Dark Modern")
- File > Preferences > File Icon Theme (should show "Material Icon Theme")

## Acceptance Criteria Checklist

- [ ] VS Code opens the project in the container successfully
- [ ] `aws --version` executes correctly and shows version 2.x or higher
- [ ] `cdk --version` executes correctly (or can be installed via npm)
- [ ] All specified VS Code extensions are installed
- [ ] VS Code theme and icon settings are applied correctly

## Troubleshooting

### Container fails to start
- Ensure Docker Desktop is running
- Check Docker Desktop has enough resources allocated (at least 4GB RAM recommended)
- Try rebuilding the container: Command Palette > "Remote-Containers: Rebuild Container"

### AWS CLI not found
- The `mcr.microsoft.com/devcontainers/universal:2` image should include AWS CLI
- If not available, install manually: `sudo apt-get update && sudo apt-get install -y awscli`

### CDK not found
- Install globally: `npm install -g aws-cdk`
- Or install locally in the project: `npm install aws-cdk`

## Notes

The DevContainer uses the Microsoft Universal Development Container image (`mcr.microsoft.com/devcontainers/universal:2`), which includes:
- Node.js (multiple versions via nvm)
- Python
- AWS CLI
- Git
- Docker CLI
- And many other common development tools

This ensures a consistent development environment across all developers working on the project.
