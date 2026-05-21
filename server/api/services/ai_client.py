"""
Unified AI Client
=================
This module is the single source of truth for all AI calls in the server.

USE_BEDROCK_TEXT=True   → Amazon Bedrock Nova Lite (text/chat)
USE_BEDROCK_IMAGE=True  → Amazon Bedrock Nova Canvas (images)
Otherwise              → Ollama (text/chat) + Stable Diffusion (images)

Usage
-----
    from api.services.ai_client import generate_text, generate_image, get_langchain_llm

    # Text / chat generation
    text = generate_text("Explain neural networks", system_prompt="Be concise")

    # Image generation — returns a PIL.Image or saves to disk
    img  = generate_image("A futuristic city skyline", output_path="/tmp/out.png")

    # LangChain-compatible LLM
    llm  = get_langchain_llm(temperature=0.7)
"""

import logging
from typing import Optional

from django.conf import settings
from langchain_core.messages import HumanMessage, SystemMessage
from PIL import Image
import json
import base64
from io import BytesIO

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _use_bedrock_text() -> bool:
    return getattr(settings, 'USE_BEDROCK_TEXT', False)


def _use_bedrock_image() -> bool:
    return getattr(settings, 'USE_BEDROCK_IMAGE', False)


def _bedrock_generate_image(prompt_text: str, output_path: Optional[str] = None) -> Optional[Image.Image]:
    """Generate an image using Amazon Nova Canvas via Bedrock Runtime."""
    try:
        import boto3
    except Exception as exc:
        logger.error("AI Client [BEDROCK] boto3 is not installed: %s", exc)
        raise RuntimeError("boto3 is required for Bedrock image support. Install with: pip install boto3")

    model_id = getattr(settings, 'BEDROCK_IMAGE_MODEL', 'amazon.nova-canvas-v1:0')
    region = getattr(settings, 'AWS_REGION', None)

    client = boto3.client('bedrock-runtime', region_name=region) if region else boto3.client('bedrock-runtime')
    payload = {
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {
            "text": prompt_text,
        },
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "quality": "standard",
            "height": 1024,
            "width": 1024,
            "cfgScale": 8.0,
            "seed": 0,
        },
    }
    logger.info("AI Client [BEDROCK] Invoking image model=%s", model_id)
    resp = client.invoke_model(
        modelId=model_id,
        contentType='application/json',
        accept='application/json',
        body=json.dumps(payload).encode('utf-8'),
    )

    body = resp.get('body')
    if hasattr(body, 'read'):
        body_bytes = body.read()
    else:
        body_bytes = body

    try:
        decoded = body_bytes.decode('utf-8')
    except Exception:
        decoded = None

    image_bytes = None
    if decoded:
        try:
            parsed = json.loads(decoded)
            # Nova Canvas responses include a list under `images`.
            if isinstance(parsed, dict):
                images = parsed.get('images', [])
                if images and isinstance(images[0], str):
                    image_bytes = base64.b64decode(images[0])
        except Exception:
            image_bytes = None

    if image_bytes is None and isinstance(body_bytes, (bytes, bytearray)):
        image_bytes = body_bytes

    if image_bytes is None:
        logger.error("AI Client [BEDROCK] No image data returned by model")
        return None

    try:
        img = Image.open(BytesIO(image_bytes)).convert('RGB')
        if output_path:
            img.save(output_path)
        return img
    except Exception:
        logger.exception("AI Client [BEDROCK] Failed to decode image bytes")
        return None


def _langchain_generate(
    prompt: str,
    system_prompt: Optional[str] = None,
    json_mode: bool = False,
    model: Optional[str] = None,
) -> str:
    """Send a chat request using the configured LangChain backend."""
    llm = get_langchain_llm(temperature=0.7, json_mode=json_mode, model_override=model)

    messages = []
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))

    final_prompt = prompt
    if json_mode:
        final_prompt = (
            f"{prompt}\n\n"
            "Return only valid JSON. Do not add markdown, commentary, or code fences."
        )
    messages.append(HumanMessage(content=final_prompt))

    backend_name = "Bedrock" if _use_bedrock_text() else "Ollama"
    logger.info("AI Client [%s] -> Generating text with json_mode=%s", backend_name, json_mode)

    response = llm.invoke(messages)
    content = (response.content or '') if hasattr(response, 'content') else str(response)

    if isinstance(content, list):
        content = ''.join(
            chunk.get('text', '') if isinstance(chunk, dict) else str(chunk)
            for chunk in content
        )

    logger.info("AI Client [%s] <- Response length=%d", backend_name, len(content))
    return content


# ── Stable Diffusion image helper ─────────────────────────────────────────────

_sd_pipeline = None  # lazy singleton


def _get_sd_pipeline():
    """Lazily load and cache the Stable Diffusion pipeline (dev only)."""
    global _sd_pipeline
    if _sd_pipeline is not None:
        return _sd_pipeline

    import torch
    from diffusers import StableDiffusionPipeline
    from diffusers.schedulers import LCMScheduler

    model_id = 'runwayml/stable-diffusion-v1-5'
    lora_id = 'latent-consistency/lcm-lora-sdv1-5'
    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    logger.info("AI Client [DEV] Loading Stable Diffusion on %s ...", device)

    pipe = StableDiffusionPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.float16 if device == 'cuda' else torch.float32,
        safety_checker=None,
    ).to(device)

    pipe.enable_attention_slicing()
    pipe.enable_vae_slicing()
    if device == 'cuda':
        pipe.enable_model_cpu_offload()

    pipe.load_lora_weights(lora_id)
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)

    _sd_pipeline = pipe
    logger.info("AI Client [DEV] Stable Diffusion loaded successfully.")
    return _sd_pipeline


def _sd_generate(prompt_text: str, output_path: Optional[str] = None) -> Optional[Image.Image]:
    """Generate an image using Stable Diffusion (dev)."""
    pipe = _get_sd_pipeline()
    full_prompt = (
        f"simple flat illustration of {prompt_text}, "
        "minimal design, clean white background, "
        "educational graphic, vector style, no text"
    )
    try:
        image: Image.Image = pipe(
            prompt=full_prompt,
            num_inference_steps=50,
            guidance_scale=1.5,
            height=512,
            width=512,
        ).images[0]
        if output_path:
            image.save(output_path)
        return image
    except Exception:
        logger.exception("AI Client [DEV] Stable Diffusion image generation failed")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def generate_text(
    prompt: str,
    system_prompt: Optional[str] = None,
    json_mode: bool = False,
    model: Optional[str] = None,
) -> str:
    """
    Generate text using the configured AI backend (Bedrock or Ollama via LangChain).

    Args:
        prompt:        User-facing prompt.
        system_prompt: Optional system-level instruction.
        json_mode:     If True, instruct the model to return valid JSON.
        model:         Optional model override.

    Returns:
        The model's response as a string.
    """
    return _langchain_generate(
        prompt,
        system_prompt=system_prompt,
        json_mode=json_mode,
        model=model,
    )


def generate_image(prompt_text: str, output_path: Optional[str] = None) -> Optional[Image.Image]:
    """
    Generate an image using the configured AI backend.

    Args:
        prompt_text: Description of the desired image.
        output_path: Optional file path to save the image (PNG/JPEG).

    Returns:
        PIL.Image object, or None on failure.
    """
    # Priority: Bedrock (if enabled) -> local Stable Diffusion
    if _use_bedrock_image():
        return _bedrock_generate_image(prompt_text, output_path=output_path)
    return _sd_generate(prompt_text, output_path=output_path)


def get_langchain_llm(temperature: float = 0.7, json_mode: bool = False, model_override: Optional[str] = None):
    """
    Return a LangChain-compatible chat model for the current environment.

    Production → ChatBedrockConverse (Amazon Bedrock Nova Lite)
    Development → ChatOllama

    Args:
        temperature: Sampling temperature (0.0 – 1.0).
        json_mode:   Whether to use json formatting (if supported).
        model_override: Optional model name to override the default.

    Returns:
        A LangChain BaseChatModel instance.
    """
    if _use_bedrock_text():
        try:
            from langchain_aws import ChatBedrockConverse
        except ImportError as exc:
            raise RuntimeError(
                "langchain-aws is not installed. "
                "Run: pip install langchain-aws"
            ) from exc

        model_name = model_override or getattr(settings, 'BEDROCK_LLM_MODEL', 'amazon.nova-lite-v1:0')
        region = getattr(settings, 'AWS_REGION', None)

        logger.info("AI Client [PROD] LangChain LLM -> ChatBedrockConverse model=%s", model_name)
        llm = ChatBedrockConverse(
            model=model_name,
            region_name=region,
            temperature=temperature,
        )
        return llm

    from langchain_ollama import ChatOllama
    model_name = model_override or getattr(settings, 'OLLAMA_MODEL', 'llama3:8b')
    logger.info("AI Client [DEV] LangChain LLM -> ChatOllama model=%s", model_name)

    kwargs = {
        "model": model_name,
        "temperature": temperature,
    }
    if json_mode:
        kwargs["format"] = "json"

    return ChatOllama(**kwargs)

