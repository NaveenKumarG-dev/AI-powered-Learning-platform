import json
import os

import boto3


def main() -> None:
    region = os.getenv("AWS_REGION", "us-east-1")
    model_id = os.getenv("BEDROCK_LLM_MODEL", "amazon.nova-lite-v1:0")

    client = boto3.client("bedrock-runtime", region_name=region)
    response = client.converse(
        modelId=model_id,
        messages=[
            {
                "role": "user",
                "content": [{"text": "Hello! Give me a one-line intro."}],
            }
        ],
    )

    output = response.get("output", {})
    message = output.get("message", {})
    content = message.get("content", [])
    text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]

    print("".join(text_parts).strip())
    print(json.dumps({"model": model_id, "region": region}, indent=2))


if __name__ == "__main__":
    main()
