#!/bin/bash
# Test script for the GeneratePresignedUrl Lambda function
# This script demonstrates how to use the presigned URL endpoint

set -e

# Check if API_URL is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <API_URL> [IMAGE_FILE]"
  echo "Example: $0 https://abc123.execute-api.us-east-1.amazonaws.com /path/to/image.jpg"
  exit 1
fi

API_URL="$1"
IMAGE_FILE="${2:-/tmp/test-image.jpg}"

echo "🔧 Testing GeneratePresignedUrl Lambda Function"
echo "================================================"
echo ""

# Create a test image if one doesn't exist
if [ ! -f "$IMAGE_FILE" ]; then
  echo "📝 Creating test image at $IMAGE_FILE..."
  # Create a small test image (1x1 pixel JPEG)
  echo -n -e '\xff\xd8\xff\xe0\x00\x10\x4a\x46\x49\x46\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00\x43\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\x09\x09\x08\x0a\x0c\x14\x0d\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c\x20\x24\x2e\x27\x20\x22\x2c\x23\x1c\x1c\x28\x37\x29\x2c\x30\x31\x34\x34\x34\x1f\x27\x39\x3d\x38\x32\x3c\x2e\x33\x34\x32\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\x7f\x00\xff\xd9' > "$IMAGE_FILE"
  echo "✅ Test image created"
else
  echo "📸 Using existing image: $IMAGE_FILE"
fi

echo ""
echo "Step 1: Request presigned URL from Lambda"
echo "==========================================="
RESPONSE=$(curl -s -X GET "${API_URL}/upload-url" -H "Content-Type: application/json")

echo "Response: $RESPONSE"
echo ""

# Parse response
UPLOAD_URL=$(echo "$RESPONSE" | grep -o '"uploadUrl":"[^"]*"' | cut -d'"' -f4)
KEY=$(echo "$RESPONSE" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
EXPIRES_IN=$(echo "$RESPONSE" | grep -o '"expiresIn":[0-9]*' | cut -d':' -f2)

if [ -z "$UPLOAD_URL" ]; then
  echo "❌ Failed to get presigned URL"
  echo "Full response: $RESPONSE"
  exit 1
fi

echo "✅ Presigned URL received:"
echo "   Key: $KEY"
echo "   Expires in: ${EXPIRES_IN}s"
echo ""

echo "Step 2: Upload image to S3 using presigned URL"
echo "==============================================="
HTTP_CODE=$(curl -s -o /tmp/upload-response.txt -w "%{http_code}" -X PUT "$UPLOAD_URL" \
  --upload-file "$IMAGE_FILE" \
  -H "Content-Type: image/jpeg")

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]; then
  echo "✅ Upload successful! (HTTP $HTTP_CODE)"
  echo ""
  echo "Step 3: Verify upload"
  echo "====================="
  echo "The image should now be in S3 with key: $KEY"
  echo "The ImageProcessor Lambda will be triggered automatically"
  echo ""
  echo "To check results, query the API:"
  echo "  curl ${API_URL}/images | jq '.[] | select(.imageId==\"$KEY\")'"
  echo ""
  echo "🎉 Test completed successfully!"
else
  echo "❌ Upload failed! (HTTP $HTTP_CODE)"
  cat /tmp/upload-response.txt
  echo ""
  exit 1
fi
