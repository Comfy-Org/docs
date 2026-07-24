#!/usr/bin/env python3
"""Sync workflow-standard blocks from EN MDX to zh/ja/ko."""

import re
from pathlib import Path

ROOT = Path("/Users/linmoumou/Documents/comfy/docs")

LOCALES = {
    "zh": {
        "Run on Comfy Cloud": "在 Comfy Cloud 上运行",
        "Download Workflow": "下载工作流",
        "Input materials": "输入素材",
        "Example output": "输出示例",
        "Open in Comfy Cloud": "在 Comfy Cloud 上打开",
    },
    "ja": {
        "Run on Comfy Cloud": "Comfy Cloud で実行",
        "Download Workflow": "ワークフローをダウンロード",
        "Input materials": "入力素材",
        "Example output": "出力例",
        "Open in Comfy Cloud": "Comfy Cloud で開く",
    },
    "ko": {
        "Run on Comfy Cloud": "Comfy Cloud에서 실행",
        "Download Workflow": "워크플로 다운로드",
        "Input materials": "입력 자료",
        "Example output": "출력 예시",
        "Open in Comfy Cloud": "Comfy Cloud에서 열기",
    },
}

FILES = {
    "tutorials/utility/depth-anything-3.mdx": "## Example Workflows",
    "tutorials/utility/face-detection/mediapipe.mdx": "## MediaPipe Face Detection Workflow",
    "tutorials/utility/pose-detection-sdpose.mdx": "## SDPose Workflows",
    "tutorials/utility/preprocessors.mdx": "## Depth estimation",
    "tutorials/utility/remove-background-birefnet.mdx": "## BiRefNet Background Removal Workflow",
    "tutorials/utility/video-segment-sam3.mdx": "## SAM 3.1 Segment Workflows",
    "tutorials/utility/void-video-inpainting.mdx": "## VOID Video Inpainting Workflow",
    "tutorials/utility/moge.mdx": "## Example Workflows",
    "tutorials/utility/seedvr2.mdx": "## Example Workflows",
    "tutorials/audio/ace-step/ace-step-v1-5.mdx": "## Option 1:",
    "tutorials/audio/stable-audio/stable-audio-1.mdx": "## Workflow",
    "tutorials/audio/stable-audio/stable-audio-3.mdx": "## Available workflows",
    "tutorials/llm/gemma4/gemma4.mdx": "## Available workflow",
    "tutorials/llm/qwen/qwen3.mdx": "## Available workflow",
    "tutorials/llm/qwen/qwen3_5.mdx": "## Available workflow",
    "tutorials/3d/hunyuan3D-2.mdx": "## ComfyUI Hunyuan3D-2mv Workflow Example",
    "tutorials/3d/triposplat.mdx": "### TripoSplat:",
}

LOC_START = {
    "tutorials/utility/depth-anything-3.mdx": [
        "## 示例工作流", "## Example Workflows",
        "## サンプルワークフロー", "## 예제 워크플로우",
    ],
    "tutorials/utility/face-detection/mediapipe.mdx": [
        "## MediaPipe 人脸检测工作流", "## MediaPipe Face Detection Workflow", "## MediaPipe",
    ],
    "tutorials/utility/pose-detection-sdpose.mdx": [
        "## SDPose 工作流", "## SDPose Workflows", "## SDPose ワークフロー", "## SDPose 워크플로",
    ],
    "tutorials/utility/preprocessors.mdx": [
        "## 深度估计", "## Depth estimation", "## 深度推定", "## 깊이 추정",
    ],
    "tutorials/utility/remove-background-birefnet.mdx": [
        "## BiRefNet 背景移除工作流", "## BiRefNet Background Removal Workflow",
        "## BiRefNet 背景除去ワークフロー", "## BiRefNet 배경 제거 워크플로우",
    ],
    "tutorials/utility/video-segment-sam3.mdx": [
        "## SAM 3.1 分割工作流", "## SAM 3.1 Segment Workflows",
        "## SAM 3.1 セグメンテーションワークフロー", "## SAM 3.1 분할 워크플로우",
    ],
    "tutorials/utility/void-video-inpainting.mdx": [
        "## VOID 视频修复工作流", "## VOID Video Inpainting Workflow",
        "## VOID ビデオ修復ワークフロー", "## VOID 비디오 인페인팅 워크플로우",
    ],
    "tutorials/utility/moge.mdx": [
        "## 示例工作流", "## Example Workflows", "## 工作流示例", "## ワークフロー例", "## 예제 워크플로우",
    ],
    "tutorials/utility/seedvr2.mdx": [
        "## 示例工作流", "## Example Workflows",
        "## 1. Image Upscale", "## 1. 图像缩放", "## 1. 画像のアップスケール", "## 1. 이미지 업스케일",
    ],
    "tutorials/audio/ace-step/ace-step-v1-5.mdx": [
        "## 选项 1", "## Option 1", "## オプション1", "## 옵션 1",
    ],
    "tutorials/audio/stable-audio/stable-audio-1.mdx": [
        "## 工作流", "## Workflow", "## ワークフロー", "## 워크플로우",
    ],
    "tutorials/audio/stable-audio/stable-audio-3.mdx": [
        "## 可用工作流", "## Available workflows", "## 利用可能なワークフロー",
        "## 이용 가능한 워크플로우", "## 사용 가능한 워크플로",
    ],
    "tutorials/llm/gemma4/gemma4.mdx": [
        "## 可用工作流", "## Available workflow", "## 利用可能なワークフロー",
        "## 이용 가능한 워크플로", "## 사용 가능한 워크플로",
    ],
    "tutorials/llm/qwen/qwen3.mdx": [
        "## 可用工作流", "## Available workflow", "## 利用可能なワークフロー",
        "## 이용 가능한 워크플로", "## 사용 가능한 워크플로",
    ],
    "tutorials/llm/qwen/qwen3_5.mdx": [
        "## 可用工作流", "## Available workflow", "## 利用可能なワークフロー",
        "## 이용 가능한 워크플로", "## 사용 가능한 워크플로",
    ],
    "tutorials/3d/hunyuan3D-2.mdx": [
        "## ComfyUI Hunyuan3D-2mv 工作流示例", "## ComfyUI Hunyuan3D-2mv Workflow Example",
        "## ComfyUI Hunyuan3D-2mv ワークフロー例", "## ComfyUI Hunyuan3D-2mv 워크플로우 예시",
    ],
    "tutorials/3d/triposplat.mdx": ["### TripoSplat", "<UpdateReminder />"],
}


def translate_labels(text: str, locale: str) -> str:
    for en, loc in LOCALES[locale].items():
        text = text.replace(f'title="{en}"', f'title="{loc}"')
        text = text.replace(f"**{en}**", f"**{loc}**")
    return text


def main() -> None:
    for rel, en_marker in FILES.items():
        en_path = ROOT / rel
        en_text = en_path.read_text()
        start = en_text.find(en_marker)
        if start == -1:
            print(f"NO EN MARKER: {rel}")
            continue
        workflow_block = en_text[start:]

        for locale in LOCALES:
            loc_path = ROOT / locale / rel
            if not loc_path.exists():
                print(f"SKIP missing {locale}/{rel}")
                continue
            loc_text = loc_path.read_text()
            fm_match = re.match(r"(---\n.*?\n---\n)", loc_text, re.S)
            if not fm_match:
                print(f"NO FM {locale}/{rel}")
                continue
            fm = fm_match.group(1)
            body = loc_text[len(fm) :]
            loc_start = None
            for marker in LOC_START.get(rel, [en_marker]):
                idx = body.find(marker)
                if idx != -1:
                    loc_start = idx
                    break
            if loc_start is None:
                print(f"NO LOC START {locale}/{rel}")
                continue
            prefix = body[:loc_start]
            translated = translate_labels(workflow_block, locale)
            loc_path.write_text(fm + prefix + translated)
            print(f"UPDATED {locale}/{rel}")


if __name__ == "__main__":
    main()
