"""
3-Stage Video Generation Pipeline for Django
=============================================
Stage 1 — Video Blueprint Generator  (LLM → structured JSON)
Stage 2 — Template Engine             (Hardcoded premium HTML templates)
Stage 3 — Slide Render Engine          (Backend: DuckDuckGo + Playwright + TTS + FFmpeg)
"""

import asyncio
import json
import logging
import os
import subprocess
import time
from io import BytesIO
from pathlib import Path
from typing import Optional

import requests
from django.conf import settings
from django.utils import timezone
from duckduckgo_search import DDGS
from PIL import Image

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

SLIDE_W, SLIDE_H = 1920, 1080
TTS_VOICE = "en-US-ChristopherNeural"


# ═══════════════════════════════════════════════════════════════════════════════
# Lazy-loaded Global Resources
# ═══════════════════════════════════════════════════════════════════════════════

_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
}


# ═══════════════════════════════════════════════════════════════════════════════
# Video Generator Service
# ═══════════════════════════════════════════════════════════════════════════════

class VideoGeneratorService:
    """
    3-Stage Video Generation Pipeline:
    1. Blueprint Generator (LLM → JSON)
    2. Template Engine (Premium HTML templates)
    3. Slide Render Engine (SD + Playwright + TTS + FFmpeg)
    """

    def __init__(self, task_id: str):
        self.task_id = str(task_id)

        # Build per-task output directories under MEDIA_ROOT
        base = os.path.join(settings.MEDIA_ROOT, "videos", self.task_id)
        self.slides_dir = os.path.join(base, "slides")
        self.scripts_dir = os.path.join(base, "scripts")
        self.output_dir = base

        for d in (self.slides_dir, self.scripts_dir, self.output_dir):
            os.makedirs(d, exist_ok=True)

    def _update_task(self, **fields):
        """Update the VideoTask record in-place."""
        from api.models import VideoTask
        VideoTask.objects.filter(pk=self.task_id).update(**fields)

    # ═══════════════════════════════════════════════════════════════════
    # STAGE 1 — VIDEO BLUEPRINT GENERATOR
    # ═══════════════════════════════════════════════════════════════════

    def _llm_call(self, system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
        """Send a chat request to the AI backend via ai_client."""
        from api.services.ai_client import generate_text
        
        # Combine system and user prompt for the backend
        combined_prompt = f"{system_prompt}\n\n{user_prompt}"
        logger.info("📡 LLM call (json_mode=%s)", json_mode)
        
        content = generate_text(combined_prompt, json_mode=json_mode)
        logger.info("📡 LLM response: %d chars", len(content))
        return content

    def stage1_generate_blueprint(self, topic: str, content: Optional[str] = None, max_retries: int = 3) -> dict:
        """
        STAGE 1: Call LLM to produce a structured video blueprint (JSON).
        """
        logger.info("="*70)
        logger.info("🧠 STAGE 1 — VIDEO BLUEPRINT GENERATOR")
        logger.info("="*70)
        logger.info("Topic: %s", topic)
        if content:
            logger.info("Content provided: %d chars", len(content))

        # Build content context if lesson content is available
        content_context = ""
        if content:
            max_len = 4000
            truncated = content[:max_len] + "..." if len(content) > max_len else content
            content_context = (
                f"\n\nUse the following lesson content as the PRIMARY basis for the video script. "
                f"The scenes should cover the key concepts from this content:\n\n{truncated}\n\n"
            )

        system_prompt = """\
You are an expert AI educational video architect.

Your task is to design a structured video plan for a high-quality 1080p educational video.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown. No commentary. No code fences.
2. The "theme" field must be exactly ONE of: "modern_dark", "light_minimal", or "gradient_academic"
3. EVERY slide MUST have a non-empty "title" field
4. EVERY slide MUST have a non-empty "narration" field (2-4 conversational sentences)
5. EVERY slide MUST have a non-empty "image_prompt" field
6. EVERY slide MUST have at least 2 bullet points in "sub_points"
7. Generate exactly 6 to 10 slides"""

        user_template = f"""\
Design a video blueprint for the following educational topic.

Output this exact JSON structure:

{{{{
  "theme": "modern_dark",
  "video_style": "cinematic",
  "slides": [
    {{{{
      "layout": "title_bullets",
      "title": "Slide Title Here",
      "sub_points": ["Bullet point one", "Bullet point two", "Bullet point three"],
      "image_prompt": "A clean minimal illustration showing...",
      "narration": "Welcome to this lesson. Today we will explore..."
    }}}}
  ]
}}}}

REQUIREMENTS:
- theme must be exactly one of: "modern_dark", "light_minimal", "gradient_academic"
- Generate 6-10 slides total
- First slide should be an introduction/title slide
- Last slide should be a summary/conclusion
- Each sub_point must be under 12 words
- Maximum 5 sub_points per slide
- narration must be 2-4 detailed, conversational sentences
- image_prompt must describe a clean, educational illustration
- Every single field must be filled — no empty strings allowed

Topic: {topic}

{content_context}"""

        for attempt in range(1, max_retries + 1):
            try:
                logger.info("Attempt %d/%d ...", attempt, max_retries)
                raw = self._llm_call(system_prompt, user_template, json_mode=True)
                blueprint = json.loads(raw)

                # Validate & fix theme
                theme = blueprint.get("theme", "modern_dark")
                valid_themes = ["modern_dark", "light_minimal", "gradient_academic"]
                if theme not in valid_themes:
                    logger.warning("Invalid theme '%s', using 'modern_dark'", theme)
                    theme = "modern_dark"
                blueprint["theme"] = theme

                if "video_style" not in blueprint:
                    blueprint["video_style"] = "cinematic"

                # Validate slides
                assert "slides" in blueprint, "Missing 'slides'"
                slides = blueprint["slides"]
                assert isinstance(slides, list) and len(slides) >= 1, "No slides"

                # Filter out slides with no narration
                valid_slides = []
                for i, s in enumerate(slides):
                    narration = s.get("narration", "").strip()
                    if not narration:
                        logger.warning("Slide %d missing narration, skipping", i)
                        continue
                    if not s.get("title"):
                        s["title"] = f"Slide {i+1}"
                    if not s.get("sub_points"):
                        s["sub_points"] = ["Key point"]
                    if not s.get("image_prompt"):
                        s["image_prompt"] = f"educational illustration about {topic}"
                    valid_slides.append(s)

                if not valid_slides:
                    raise AssertionError("No valid slides with narration")

                blueprint["slides"] = valid_slides
                logger.info("✅ Blueprint: %d slides, theme='%s'", len(valid_slides), blueprint['theme'])
                return blueprint

            except (json.JSONDecodeError, AssertionError, KeyError) as e:
                logger.warning("⚠️  Attempt %d failed: %s", attempt, e)
                if attempt == max_retries:
                    raise RuntimeError(f"Stage 1 failed after {max_retries} attempts")

        raise RuntimeError("Stage 1 failed")

    # ═══════════════════════════════════════════════════════════════════
    # STAGE 2 — TEMPLATE ENGINE (Hardcoded Premium Templates)
    # ═══════════════════════════════════════════════════════════════════

    def stage2_get_template(self, theme: str) -> str:
        """
        STAGE 2: Return a high-quality hardcoded HTML slide template.
        """
        logger.info("="*70)
        logger.info("🎨 STAGE 2 — TEMPLATE ENGINE")
        logger.info("="*70)
        logger.info("Theme: %s", theme)

        templates = {
            "modern_dark": self._template_modern_dark(),
            "light_minimal": self._template_light_minimal(),
            "gradient_academic": self._template_gradient_academic(),
        }

        html = templates.get(theme, templates["modern_dark"])
        logger.info("✅ Template loaded: %d chars", len(html))
        return html

    def _template_modern_dark(self) -> str:
        return """\
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;width:1920px;height:1080px;
             background:linear-gradient(160deg, #0d1117 0%, #161b22 40%, #1a1a2e 100%);
             font-family:'Segoe UI',Helvetica,Arial,sans-serif;overflow:hidden;">

  <div style="display:flex;width:1920px;height:1080px;box-sizing:border-box;padding:70px 80px;">

    <!-- Left Column: Text (58%) -->
    <div style="flex:0 0 58%;display:flex;flex-direction:column;justify-content:center;
                padding-right:60px;overflow:hidden;">

      <!-- Accent bar + Title -->
      <div style="border-left:6px solid #58a6ff;padding-left:28px;margin-bottom:48px;">
        <div style="font-size:52px;font-weight:800;color:#ffffff;line-height:1.25;
                    letter-spacing:-0.5px;word-wrap:break-word;">
          {{TITLE}}
        </div>
      </div>

      <!-- Bullet Points -->
      <div style="padding-left:34px;">
        {{CONTENT}}
      </div>
    </div>

    <!-- Right Column: Image (42%) -->
    <div style="flex:0 0 42%;display:flex;align-items:center;justify-content:center;
                background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.15);
                border-radius:24px;overflow:hidden;padding:30px;">
      {{IMAGE}}
    </div>

  </div>

  <!-- Bottom accent line -->
  <div style="position:absolute;bottom:0;left:0;width:100%;height:4px;
              background:linear-gradient(90deg,#58a6ff 0%,#a371f7 50%,#f778ba 100%);"></div>

</body>
</html>"""

    def _template_light_minimal(self) -> str:
        return """\
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;width:1920px;height:1080px;
             background:#fafbfc;
             font-family:'Segoe UI',Helvetica,Arial,sans-serif;overflow:hidden;">

  <div style="display:flex;width:1920px;height:1080px;box-sizing:border-box;padding:70px 80px;">

    <!-- Left Column: Text (58%) -->
    <div style="flex:0 0 58%;display:flex;flex-direction:column;justify-content:center;
                padding-right:60px;overflow:hidden;">

      <!-- Title -->
      <div style="border-left:6px solid #0969da;padding-left:28px;margin-bottom:48px;">
        <div style="font-size:52px;font-weight:800;color:#1a1a2e;line-height:1.25;
                    letter-spacing:-0.5px;word-wrap:break-word;">
          {{TITLE}}
        </div>
      </div>

      <!-- Bullets -->
      <div style="padding-left:34px;">
        {{CONTENT}}
      </div>
    </div>

    <!-- Right Column: Image (42%) -->
    <div style="flex:0 0 42%;display:flex;align-items:center;justify-content:center;
                background:#f0f4f8;border:1px solid #d0d7de;
                border-radius:24px;overflow:hidden;padding:30px;">
      {{IMAGE}}
    </div>

  </div>

  <!-- Bottom accent -->
  <div style="position:absolute;bottom:0;left:0;width:100%;height:4px;
              background:linear-gradient(90deg,#0969da 0%,#1a7f37 50%,#8250df 100%);"></div>

</body>
</html>"""

    def _template_gradient_academic(self) -> str:
        return """\
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;width:1920px;height:1080px;
             background:linear-gradient(135deg, #1a1a3e 0%, #2d1b4e 40%, #0f0c29 100%);
             font-family:'Segoe UI',Georgia,serif;overflow:hidden;">

  <div style="display:flex;width:1920px;height:1080px;box-sizing:border-box;padding:70px 80px;">

    <!-- Left Column: Text (58%) -->
    <div style="flex:0 0 58%;display:flex;flex-direction:column;justify-content:center;
                padding-right:60px;overflow:hidden;">

      <!-- Title -->
      <div style="border-left:6px solid #d4a947;padding-left:28px;margin-bottom:48px;">
        <div style="font-size:52px;font-weight:800;color:#f5e6c8;line-height:1.25;
                    letter-spacing:-0.5px;word-wrap:break-word;">
          {{TITLE}}
        </div>
      </div>

      <!-- Bullets -->
      <div style="padding-left:34px;">
        {{CONTENT}}
      </div>
    </div>

    <!-- Right Column: Image (42%) -->
    <div style="flex:0 0 42%;display:flex;align-items:center;justify-content:center;
                background:rgba(212,169,71,0.06);border:1px solid rgba(212,169,71,0.2);
                border-radius:24px;overflow:hidden;padding:30px;">
      {{IMAGE}}
    </div>

  </div>

  <!-- Bottom accent -->
  <div style="position:absolute;bottom:0;left:0;width:100%;height:4px;
              background:linear-gradient(90deg,#d4a947 0%,#c0392b 50%,#8e44ad 100%);"></div>

</body>
</html>"""

    # ═══════════════════════════════════════════════════════════════════
    # STAGE 3 — SLIDE RENDER ENGINE
    # ═══════════════════════════════════════════════════════════════════

    # ─── 3a. Image Generation (DuckDuckGo Search) ─────────────────────

    def _download_image(self, image_url: str, output_path: str, referer: Optional[str] = None) -> bool:
        """Download an image URL and persist it as a local file."""
        headers = dict(_HTTP_HEADERS)
        if referer:
            headers["Referer"] = referer

        response = requests.get(image_url, headers=headers, timeout=20, stream=True)
        response.raise_for_status()

        image = Image.open(BytesIO(response.content)).convert("RGB")
        image.save(output_path)
        return True

    def generate_image_duckduckgo(self, prompt_text: str, output_path: str) -> Optional[str]:
        """Find a relevant image via DuckDuckGo Images and download it locally."""
        try:
            search_query = f"{prompt_text} educational illustration"
            logger.info("🔎 DuckDuckGo image search: %s", search_query)

            with DDGS() as ddgs:
                results = ddgs.images(search_query, max_results=5)

                for result in results:
                    image_url = result.get("image") or result.get("thumbnail")
                    if not image_url:
                        continue

                    try:
                        self._download_image(image_url, output_path, referer=result.get("url"))
                        logger.info("✅ DuckDuckGo image saved: %s", os.path.basename(output_path))
                        return output_path
                    except Exception as exc:
                        logger.warning("⚠️  Could not download DuckDuckGo result: %s", exc)

            logger.warning("⚠️  No downloadable DuckDuckGo image found for: %s", prompt_text)
            return None
        except ImportError as exc:
            logger.error("⚠️  duckduckgo-search is not installed: %s", exc)
            return None
        except Exception as e:
            logger.error("⚠️  DuckDuckGo image lookup error: %s", e)
            return None

    # ─── 3b. HTML Population ───────────────────────────────────────────

    def _get_bullet_style(self, theme: str) -> dict:
        """Return CSS styling per theme for bullet points."""
        styles = {
            "modern_dark": {
                "text_color": "#c9d1d9",
                "dot_color": "#58a6ff",
                "dot_bg": "rgba(88,166,255,0.15)",
            },
            "light_minimal": {
                "text_color": "#24292f",
                "dot_color": "#0969da",
                "dot_bg": "rgba(9,105,218,0.1)",
            },
            "gradient_academic": {
                "text_color": "#e8e0d0",
                "dot_color": "#d4a947",
                "dot_bg": "rgba(212,169,71,0.15)",
            },
        }
        return styles.get(theme, styles["modern_dark"])

    def populate_template(self, template_html: str, slide: dict, image_path: Optional[str],
                          theme: str = "modern_dark") -> str:
        """Replace placeholders in the HTML template with actual slide data."""
        title = slide.get("title", "")

        # Build styled bullet points
        bullets = slide.get("sub_points", [])
        bs = self._get_bullet_style(theme)

        if bullets:
            items = []
            for b in bullets:
                item = (
                    f'<div style="display:flex;align-items:center;margin-bottom:28px;">'
                    f'  <div style="flex-shrink:0;width:16px;height:16px;border-radius:50%;'
                    f'              background:{bs["dot_color"]};margin-right:20px;'
                    f'              box-shadow:0 0 0 8px {bs["dot_bg"]};"></div>'
                    f'  <div style="font-size:36px;color:{bs["text_color"]};line-height:1.4;">{b}</div>'
                    f'</div>'
                )
                items.append(item)
            content_html = "".join(items)
        else:
            content_html = ""

        # Image tag
        if image_path and os.path.exists(image_path):
            abs_path = Path(image_path).resolve().as_uri()
            image_html = (
                f'<img src="{abs_path}" '
                f'style="max-width:100%;max-height:100%;border-radius:16px;'
                f'object-fit:contain;" />'
            )
        else:
            image_html = (
                '<div style="width:200px;height:200px;border-radius:50%;'
                'background:rgba(128,128,128,0.1);"></div>'
            )

        html = template_html
        html = html.replace("{{TITLE}}", title)
        html = html.replace("{{CONTENT}}", content_html)
        html = html.replace("{{IMAGE}}", image_html)

        return html

    # ─── 3c. Playwright Screenshot ─────────────────────────────────────

    def screenshot_html(self, html_content: str, output_png: str) -> str:
        """Render HTML at 1920×1080 using Playwright and save as PNG."""
        try:
            from playwright.sync_api import sync_playwright

            html_file = output_png.replace(".png", ".html")
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(html_content)

            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": SLIDE_W, "height": SLIDE_H})
                page.goto(f"file:///{html_file}")
                page.screenshot(path=output_png)
                browser.close()

            logger.info("📸 Screenshot → %s", os.path.basename(output_png))
            return output_png

        except ImportError:
            logger.warning("⚠️  Playwright not available — using PIL fallback")
            return self._pil_fallback_slide(output_png)
        except Exception as e:
            logger.error("❌ Playwright error: %s — using PIL fallback", e)
            return self._pil_fallback_slide(output_png)

    def _pil_fallback_slide(self, output_png: str) -> str:
        """Minimal PIL fallback."""
        img = Image.new("RGB", (SLIDE_W, SLIDE_H), color="#0d1117")
        img.save(output_png)
        return output_png

    # ─── 3d. TTS Audio (Edge-TTS) ──────────────────────────────────────

    async def _generate_tts_async(self, text: str, output_mp3: str) -> Optional[str]:
        try:
            import edge_tts
            communicate = edge_tts.Communicate(text, TTS_VOICE)
            await communicate.save(output_mp3)
            if os.path.exists(output_mp3) and os.path.getsize(output_mp3) > 0:
                return output_mp3
            return None
        except Exception as e:
            logger.error("❌ TTS error: %s", e)
            return None

    def generate_tts_sync(self, text: str, output_mp3: str) -> Optional[str]:
        """Synchronous wrapper for TTS."""
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self._generate_tts_async(text, output_mp3))
        finally:
            loop.close()

    # ─── 3e. FFmpeg ────────────────────────────────────────────────────

    def get_audio_duration(self, audio_path: str) -> float:
        """Get audio duration using ffprobe."""
        cmd = [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            audio_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
            return float(result.stdout.strip())
        except Exception:
            return 10.0

    def render_slide_video(self, slide_png: str, audio_mp3: str, output_mp4: str) -> Optional[str]:
        """Combine slide PNG + audio MP3 → MP4 clip via FFmpeg."""
        duration = self.get_audio_duration(audio_mp3)
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", slide_png,
            "-i", audio_mp3,
            "-c:v", "libx264",
            "-tune", "stillimage",
            "-c:a", "aac",
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-t", str(duration),
            "-shortest",
            "-vf", f"scale={SLIDE_W}:{SLIDE_H}:force_original_aspect_ratio=decrease,"
                   f"pad={SLIDE_W}:{SLIDE_H}:(ow-iw)/2:(oh-ih)/2",
            output_mp4,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error("❌ FFmpeg error:\n%s", result.stderr[-500:])
            return None
        logger.info("✅ Video clip: %s", os.path.basename(output_mp4))
        return output_mp4

    def ffmpeg_concat(self, clip_paths: list, output_path: str) -> Optional[str]:
        """Merge slide clips via FFmpeg concat."""
        if not clip_paths:
            return None

        list_file = output_path.replace(".mp4", "_list.txt")
        with open(list_file, "w", encoding="utf-8") as f:
            for p in clip_paths:
                f.write(f"file '{os.path.abspath(p)}'\n")

        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", list_file,
            "-c", "copy",
            output_path,
        ]

        logger.info("🔗 Merging %d clips → %s", len(clip_paths), os.path.basename(output_path))
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            logger.error("❌ FFmpeg merge error:\n%s", result.stderr[-500:])
            return None
        return output_path

    # ═══════════════════════════════════════════════════════════════════
    # STAGE 3 ORCHESTRATOR — Full Render Pipeline
    # ═══════════════════════════════════════════════════════════════════

    def stage3_render(self, blueprint: dict, template_html: str) -> Optional[str]:
        """STAGE 3: Render all slides → merge into final video."""
        logger.info("="*70)
        logger.info("🎥 STAGE 3 — SLIDE RENDER ENGINE")
        logger.info("="*70)

        slides = blueprint["slides"]
        theme = blueprint.get("theme", "modern_dark")
        slide_clips = []

        for i, slide in enumerate(slides, start=1):
            slide_title = slide.get("title", f"Slide {i}")
            slide_dir = os.path.join(self.slides_dir, f"slide_{i:02d}")
            os.makedirs(slide_dir, exist_ok=True)

            logger.info("── Slide %d/%d: %s ──", i, len(slides), slide_title)
            self._update_task(progress_message=f"Processing slide {i}/{len(slides)}: {slide_title}")

            # 3a: Image
            image_path = None
            image_prompt = slide.get("image_prompt", "").strip()
            if image_prompt:
                logger.info("🎨 Looking up image via DuckDuckGo...")
                img_out = os.path.join(slide_dir, "image.png")
                image_path = self.generate_image_duckduckgo(image_prompt, img_out)

            # 3b: Populate HTML
            populated_html = self.populate_template(template_html, slide, image_path, theme=theme)
            html_path = os.path.join(slide_dir, "slide.html")
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(populated_html)

            # 3c: Screenshot
            slide_png = os.path.join(slide_dir, "slide.png")
            self.screenshot_html(populated_html, slide_png)

            # 3d: TTS
            narration = slide.get("narration", "").strip()
            if not narration:
                logger.warning("⚠️ Slide %d has no narration, skipping...", i)
                continue

            audio_mp3 = os.path.join(slide_dir, "narration.mp3")
            logger.info("🔊 Generating TTS audio...")
            audio_result = self.generate_tts_sync(narration, audio_mp3)
            if not audio_result:
                logger.warning("⚠️ TTS failed for slide %d, skipping...", i)
                continue

            duration = self.get_audio_duration(audio_mp3)
            logger.info("✅ Audio: %.1fs", duration)

            # 3e: Render clip
            slide_mp4 = os.path.join(slide_dir, "slide.mp4")
            logger.info("🎬 Rendering clip...")
            clip = self.render_slide_video(slide_png, audio_mp3, slide_mp4)
            if clip:
                slide_clips.append(clip)
                logger.info("✅ Slide %d complete!", i)
            else:
                logger.error("❌ Clip rendering failed for slide %d", i)

        # Final merge
        if not slide_clips:
            logger.error("❌ No clips created!")
            return None

        logger.info("🎞️  Merging %d clips...", len(slide_clips))
        final_path = os.path.join(self.output_dir, "final_video.mp4")
        result = self.ffmpeg_concat(slide_clips, final_path)

        if result:
            size_mb = os.path.getsize(result) / (1024 * 1024)
            logger.info("✅ Final video: %s (%.1f MB)", result, size_mb)
        return result
        if result:
            size_mb = os.path.getsize(result) / (1024 * 1024)
            logger.info("✅ Final video: %s (%.1f MB)", result, size_mb)
        return result

    # ═══════════════════════════════════════════════════════════════════
    # FULL PIPELINE ORCHESTRATOR
    # ═══════════════════════════════════════════════════════════════════

    def run(self, topic: str, content: Optional[str] = None) -> str:
        """
        Execute the full 3-stage video generation pipeline.
        
        Args:
            topic: The topic name for the video
            content: Optional generated lesson content to base the video on
            
        Returns:
            Path to the final video file
            
        Raises:
            RuntimeError: If any stage fails
        """
        start_time = time.time()
        
        logger.info("█" * 70)
        logger.info("🚀 3-STAGE VIDEO GENERATION PIPELINE")
        logger.info("█" * 70)
        logger.info("Topic: %s", topic)
        logger.info("Output: %s", self.output_dir)
        logger.info("Resolution: %dx%d", SLIDE_W, SLIDE_H)

        # ════════════════════════════════════════════════════════════════
        # STAGE 1: Generate Blueprint
        # ════════════════════════════════════════════════════════════════
        self._update_task(
            status="processing",
            progress_message="Stage 1: Generating video blueprint...",
        )
        
        blueprint = self.stage1_generate_blueprint(topic, content=content)
        
        # Persist blueprint
        bp_path = os.path.join(self.scripts_dir, "blueprint.json")
        with open(bp_path, "w", encoding="utf-8") as f:
            json.dump(blueprint, f, indent=2)
        logger.info("📄 Blueprint → %s", bp_path)

        slides = blueprint.get("slides", [])
        if not slides:
            raise RuntimeError("Blueprint contains no slides.")

        self._update_task(
            script_data=blueprint,
            progress_message=f"Blueprint ready — {len(slides)} slides. Starting Stage 2...",
        )

        # ════════════════════════════════════════════════════════════════
        # STAGE 2: Get Template
        # ════════════════════════════════════════════════════════════════
        self._update_task(
            progress_message="Stage 2: Loading template...",
        )
        
        theme = blueprint.get("theme", "modern_dark")
        template_html = self.stage2_get_template(theme)
        
        # Persist template
        tmpl_path = os.path.join(self.output_dir, "template.html")
        with open(tmpl_path, "w", encoding="utf-8") as f:
            f.write(template_html)
        logger.info("📄 Template → %s", tmpl_path)

        self._update_task(
            progress_message=f"Template ready (theme: {theme}). Starting Stage 3...",
        )

        # ════════════════════════════════════════════════════════════════
        # STAGE 3: Render Slides & Merge Video
        # ════════════════════════════════════════════════════════════════
        self._update_task(
            progress_message="Stage 3: Rendering slides...",
        )
        
        final_video = self.stage3_render(blueprint, template_html)
        
        if not final_video:
            raise RuntimeError("Failed to render and merge video clips.")

        # ════════════════════════════════════════════════════════════════
        # Complete
        # ════════════════════════════════════════════════════════════════
        elapsed = time.time() - start_time
        mins, secs = divmod(int(elapsed), 60)

        logger.info("█" * 70)
        logger.info("🎉 DONE! %dm %ds", mins, secs)
        logger.info("📹 %s", final_video)
        logger.info("█" * 70)

        return final_video
