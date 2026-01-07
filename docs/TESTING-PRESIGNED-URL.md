# Testing the GeneratePresignedUrl Lambda Function

This document describes how to test the presigned URL functionality for secure S3 uploads.

## Prerequisites

- The infrastructure must be deployed (`cdk deploy`)
- You need the API Gateway URL (output from the deployment)
- `curl` and `jq` (optional) installed

## Automated Testing

We provide a bash script to test the entire flow:

```bash
# Get the API URL from CDK outputs
API_URL=$(cd infra && npx cdk deploy --outputs-file outputs.json && jq -r '.InfraStack.HttpApiUrl' outputs.json)

# Run the test script
./docs/test-presigned-url.sh "$API_URL" /path/to/your/image.jpg
```

If you don't specify an image file, the script will create a minimal test JPEG.

## Manual Testing

### Step 1: Request a Presigned URL

```bash
# Replace with your actual API Gateway URL
API_URL="https://abc123.execute-api.us-east-1.amazonaws.com"

# Request a presigned URL
curl -X POST "${API_URL}/upload-url" \
  -H "Content-Type: application/json" | jq
```

Expected response:
```json
{
  "uploadUrl": "https://bucket-name.s3.region.amazonaws.com/uploads/1234567890-xyz123.jpg?X-Amz-...",
  "key": "uploads/1234567890-xyz123.jpg",
  "expiresIn": 300
}
```

### Step 2: Upload an Image

Use the `uploadUrl` from the previous response:

```bash
# Save the upload URL
UPLOAD_URL="<paste-upload-url-here>"

# Upload your image
curl -X PUT "$UPLOAD_URL" \
  --upload-file /path/to/your/image.jpg \
  -H "Content-Type: image/jpeg" \
  -v
```

Expected HTTP status: **200 OK** or **204 No Content**

### Step 3: Verify the Upload

After uploading, the S3 ObjectCreated event will trigger the ImageProcessor Lambda automatically.

Wait a few seconds, then query the API to see the processed results:

```bash
# Get all images
curl "${API_URL}/images" | jq

# Filter for your specific image
KEY="uploads/1234567890-xyz123.jpg"
curl "${API_URL}/images" | jq ".[] | select(.imageId==\"$KEY\")"
```

Expected response (after processing):
```json
{
  "imageId": "uploads/1234567890-xyz123.jpg",
  "s3Url": "https://bucket-name.s3.region.amazonaws.com/uploads/1234567890-xyz123.jpg",
  "labels": [
    {
      "name": "Dog",
      "confidence": 95.5
    },
    {
      "name": "Pet",
      "confidence": 92.3
    }
  ],
  "timestamp": "2024-01-07T13:00:00.000Z"
}
```

## Testing with Python

```python
import requests
import json

# Step 1: Get presigned URL
api_url = "https://abc123.execute-api.us-east-1.amazonaws.com"
response = requests.post(f"{api_url}/upload-url")
data = response.json()

upload_url = data['uploadUrl']
key = data['key']

print(f"Presigned URL: {upload_url}")
print(f"Key: {key}")

# Step 2: Upload image
with open('/path/to/image.jpg', 'rb') as f:
    upload_response = requests.put(upload_url, data=f, headers={'Content-Type': 'image/jpeg'})
    
print(f"Upload status: {upload_response.status_code}")

# Step 3: Wait and check results (after a few seconds)
import time
time.sleep(5)

images_response = requests.get(f"{api_url}/images")
images = images_response.json()
my_image = [img for img in images if img['imageId'] == key]
print(json.dumps(my_image, indent=2))
```

## Testing with JavaScript/Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

const API_URL = 'https://abc123.execute-api.us-east-1.amazonaws.com';

async function testPresignedUrl() {
  // Step 1: Get presigned URL
  const { data } = await axios.post(`${API_URL}/upload-url`);
  console.log('Presigned URL:', data.uploadUrl);
  console.log('Key:', data.key);

  // Step 2: Upload image
  const imageBuffer = fs.readFileSync('/path/to/image.jpg');
  const uploadResponse = await axios.put(data.uploadUrl, imageBuffer, {
    headers: { 'Content-Type': 'image/jpeg' }
  });
  console.log('Upload status:', uploadResponse.status);

  // Step 3: Wait and check results
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const imagesResponse = await axios.get(`${API_URL}/images`);
  const myImage = imagesResponse.data.find(img => img.imageId === data.key);
  console.log('Processed image:', JSON.stringify(myImage, null, 2));
}

testPresignedUrl().catch(console.error);
```

## Security Notes

1. **Expiration**: Presigned URLs expire after 5 minutes (300 seconds)
2. **CORS**: The API allows requests from any origin (`*`) - restrict this in production
3. **Authentication**: Currently there's no authentication - add API Gateway authorizers in production
4. **Rate Limiting**: Consider adding rate limiting to prevent abuse

## Troubleshooting

### "Access Denied" on upload
- Check that the Lambda has `s3:PutObject` permission
- Verify the presigned URL hasn't expired (5 minutes max)
- Ensure you're using PUT method, not POST

### Upload succeeds but no results appear
- Wait a few seconds for the ImageProcessor Lambda to run
- Check CloudWatch Logs for the ImageProcessor Lambda
- Verify the S3 event notification is configured correctly

### "CORS error" in browser
- Ensure CORS is configured in API Gateway
- Check that the S3 bucket has CORS rules for PUT operations
- Verify you're sending the correct headers

## Next Steps

After successful testing:
1. Add authentication to the `/upload-url` endpoint
2. Implement rate limiting
3. Add request body validation (file type, size limits)
4. Configure production CORS settings
5. Set up monitoring and alarms for failed uploads
