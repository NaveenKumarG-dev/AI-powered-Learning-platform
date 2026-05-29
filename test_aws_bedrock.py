import os
import json
import base64
import boto3
from dotenv import load_dotenv

def test_nova_text(client, model_id):
    print(f"\n--- Testing Text Model: {model_id} ---")
    try:
        response = client.converse(
            modelId=model_id,
            messages=[
                {
                    "role": "user",
                    "content": [{"text": "Hello! Please tell me a story in tamil +english"}],
                }
            ],
        )
        
        output = response.get("output", {})
        message = output.get("message", {})
        content = message.get("content", [])
        text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]
        
        print("Success! Response from model:")
        print("".join(text_parts).strip())
    except Exception as e:
        print(f"Failed to test text model: {e}")

def test_nova_image(client, model_id):
    print(f"\n--- Testing Image Model: {model_id} ---")
    try:
        # Amazon Nova Canvas payload format
        body = json.dumps({
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {
                "text": "A futuristic city skyline at sunset in synthwave style"
            },
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "height": 512,
                "width": 512,
                "cfgScale": 8.0
            }
        })

        response = client.invoke_model(
            modelId=model_id,
            body=body,
            accept="application/json",
            contentType="application/json"
        )
        
        response_body = json.loads(response.get('body').read())
        images = response_body.get("images")
        
        if images and len(images) > 0:
            print(f"Success! Image generated (base64 length: {len(images[0])})")
            
            # Optionally save it
            image_path = "test_image.png"
            with open(image_path, "wb") as f:
                f.write(base64.b64decode(images[0]))
            print(f"Image saved locally to {image_path}")
        else:
            print("Model succeeded, but returned no images in response.")
    except Exception as e:
        print(f"Failed to test image model: {e}")

def main():
    # Load environment variables from server/.env
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(__file__), 'server', '.env')
    
    if os.path.exists(env_path):
        print(f"Loading credentials from {env_path}")
        load_dotenv(env_path)
    else:
        print("Could not find server/.env file. Make sure you are running from the workspace root.")

    # Initialize bedrock client
    aws_region = os.getenv("AWS_REGION", "us-east-1")
    text_model = os.getenv("BEDROCK_LLM_MODEL", "amazon.nova-lite-v1:0")
    image_model = os.getenv("BEDROCK_IMAGE_MODEL", "amazon.nova-canvas-v1:0")
    
    # Check if we have aws credentials
    if not os.getenv("AWS_ACCESS_KEY_ID") or not os.getenv("AWS_SECRET_ACCESS_KEY"):
        print("Warning: AWS credentials not found in env. Ensure they are correctly spelled in .env")

    print(f"Connecting to AWS Bedrock in region: {aws_region}")
    
    # We specify keys explicitly for clarity, though boto3 will find them in env anyway
    client = boto3.client(
        "bedrock-runtime",
        region_name=aws_region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN") # Will be None if empty, which is fine
    )

    test_nova_text(client, text_model)
    test_nova_image(client, image_model)


if __name__ == "__main__":
    main()
