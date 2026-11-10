"""AI images for custom T-shirts, using the OpenAI Images API (needs OPENAI_API_KEY in backend/.env)."""
import base64
import logging

import httpx

from ..config import settings

log = logging.getLogger("ikart.ai")

STYLES = {
    "none": "",
    "minimalist": "minimalist flat vector illustration, few colours, clean shapes",
    "cartoon": "fun cartoon illustration, bold outlines, vibrant colours",
    "traditional_indian": "traditional Indian art style inspired by Madhubani and Kalamkari patterns",
    "modern": "modern graphic design, geometric, stylish",
    "vintage": "vintage retro badge illustration, distressed texture, muted colours",
    "bold_graphic": "bold streetwear graphic, high contrast, thick lines",
}


class AiImageError(Exception):
    pass


def generate(prompt: str, style: str) -> bytes:
    """Returns PNG bytes (transparent background) for the prompt."""
    if not settings.ai_images_enabled:
        raise AiImageError("AI images are not set up")
    full = (
        f"{prompt.strip()}. {STYLES.get(style, '')}. "
        "A single standalone graphic for printing on a T-shirt, centred, on a transparent background. "
        "No T-shirt, no mockup, no frame, no watermark."
    )
    try:
        r = httpx.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.openai_image_model,
                "prompt": full,
                "size": "1024x1024",
                "background": "transparent",
                "output_format": "png",
                "quality": settings.openai_image_quality,
                "n": 1,
            },
            timeout=180,
        )
    except httpx.HTTPError as e:
        log.warning("OpenAI request failed: %s", e)
        raise AiImageError("The image service is not responding. Please try again.")
    try:
        body = r.json()
    except ValueError:
        body = {}
    if r.status_code != 200:
        msg = (body.get("error") or {}).get("message") or f"Image service error ({r.status_code})"
        log.warning("OpenAI image error %s: %s", r.status_code, msg)
        if r.status_code == 400 and "safety" in msg.lower():
            msg = "This prompt can't be used. Please try describing something else."
        raise AiImageError(msg)
    item = (body.get("data") or [{}])[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if item.get("url"):
        return httpx.get(item["url"], timeout=60).content
    raise AiImageError("The image service returned no image")
