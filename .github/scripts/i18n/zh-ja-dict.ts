/**
 * Chinese → Japanese correction dictionary.
 *
 * These are words/phrases that are natural in Chinese but wrong or unnatural
 * in Japanese. When an LLM translates EN+ZH→JA, it sometimes "leaks" the
 * Chinese form instead of using the correct Japanese equivalent.
 *
 * Categories:
 *   1. Chinese-only words (don't exist in Japanese)
 *   2. Same kanji but different meaning (false friends)
 *   3. Chinese prefers kanji where Japanese prefers katakana loanword
 *   4. Simplified Chinese characters not used in Japanese
 *
 * Format: [chinese, japanese, category, note?]
 */

export const ZH_JA_DICT: [string, string, string, string?][] = [
  // ── Category 1: Chinese-only vocabulary (no Japanese equivalent in kanji) ──

  // Common function words / particles
  ["的", null!, "skip", "too common, context-dependent"],  // skip — used differently in JP

  // Tech terms where ZH uses kanji but JA uses katakana
  ["视频", "動画", "tech", "video"],
  ["音频", "オーディオ", "tech", "audio"],
  ["语音", "音声", "tech", "voice/speech"],
  ["链接", "リンク", "tech", "link"],
  ["默认", "デフォルト", "tech", "default"],
  ["图标", "アイコン", "tech", "icon"],
  ["文件夹", "フォルダ", "tech", "folder"],
  ["文件", "ファイル", "tech", "file — careful: 文件 can mean document in JP context"],
  ["服务器", "サーバー", "tech", "server"],
  ["浏览器", "ブラウザ", "tech", "browser"],
  ["软件", "ソフトウェア", "tech", "software"],
  ["硬件", "ハードウェア", "tech", "hardware"],
  ["程序", "プログラム", "tech", "program"],
  ["代码", "コード", "tech", "code"],
  ["数据", "データ", "tech", "data"],
  ["数据库", "データベース", "tech", "database"],
  ["接口", "インターフェース", "tech", "interface/API"],
  ["网络", "ネットワーク", "tech", "network"],
  ["网站", "ウェブサイト", "tech", "website"],
  ["网页", "ウェブページ", "tech", "webpage"],
  ["博客", "ブログ", "tech", "blog"],
  ["内存", "メモリ", "tech", "memory (RAM)"],
  ["缓存", "キャッシュ", "tech", "cache"],
  ["驱动", "ドライバー", "tech", "driver"],
  ["鼠标", "マウス", "tech", "mouse"],
  ["键盘", "キーボード", "tech", "keyboard"],
  ["屏幕", "スクリーン", "tech", "screen"],
  ["桌面", "デスクトップ", "tech", "desktop"],
  ["窗口", "ウィンドウ", "tech", "window"],
  ["菜单", "メニュー", "tech", "menu"],
  ["按钮", "ボタン", "tech", "button"],
  ["标签", "タブ", "tech", "tab (UI)"],
  ["下载", "ダウンロード", "tech", "download"],
  ["上传", "アップロード", "tech", "upload"],
  ["安装", "インストール", "tech", "install"],
  ["卸载", "アンインストール", "tech", "uninstall"],
  ["更新", "アップデート", "skip", "update — 更新 is valid Japanese (こうしん), skip"],
  ["升级", "アップグレード", "tech", "upgrade"],
  ["登录", "ログイン", "tech", "login"],
  ["注册", "登録", "tech", "register"],
  ["密码", "パスワード", "tech", "password"],
  ["用户名", "ユーザー名", "tech", "username"],

  // ── Category 2: Chinese words that exist in JP but with different/rare usage ──

  ["信息", "情報", "vocab", "information"],
  ["运行", "実行", "vocab", "run/execute"],
  ["应用", "アプリケーション", "vocab", "application"],
  ["项目", "プロジェクト", "vocab", "project"],
  ["选项", "オプション", "vocab", "option"],
  ["功能", "機能", "vocab", "function/feature — same kanji but 功能 is ZH form"],
  ["支持", "サポート", "vocab", "support — JP uses both but サポート more common in tech"],
  ["问题", "問題", "vocab", "problem — JP uses 問題 too, but watch for ZH grammar"],
  ["简单", "シンプル", "vocab", "simple"],
  ["复杂", "複雑", "vocab", "complex — same meaning but 复杂 is simplified"],
  ["尝试", "試す", "vocab", "try"],
  ["确认", "確認", "vocab", "confirm — same but 确 is simplified"],
  ["删除", "削除", "vocab", "delete — same meaning but 删 is simplified"],
  ["创建", "作成", "vocab", "create"],
  ["修改", "変更", "vocab", "modify"],
  ["获取", "取得", "vocab", "obtain/get"],
  ["显示", "表示", "vocab", "display"],
  ["隐藏", "非表示", "vocab", "hide"],
  ["完成", "完了", "skip", "complete — 完成 is valid Japanese (かんせい), skip"],
  ["取消", "キャンセル", "vocab", "cancel"],
  ["开始", "開始", "vocab", "start — same but 开 is simplified"],
  ["结束", "終了", "vocab", "end"],
  ["添加", "追加", "vocab", "add"],
  ["移除", "除去", "vocab", "remove"],

  // ── Category 3: Simplified Chinese characters not used in Japanese ──
  // These are dead giveaways of Chinese contamination

  ["请", "ください", "simplified", "please — 请 is simplified form of 請"],
  ["这", "この", "simplified", "this — ZH-only"],
  ["那", "その", "simplified", "that — ZH-only (in this usage)"],
  ["还", "まだ", "simplified", "still/yet — ZH-only"],
  ["没有", "ありません", "simplified", "don't have — ZH grammar"],
  ["已经", "すでに", "simplified", "already"],
  ["如果", "もし", "simplified", "if — ZH-only"],
  ["因为", "なぜなら", "simplified", "because — ZH-only"],
  ["所以", "そのため", "simplified", "therefore — ZH-only"],
  ["但是", "しかし", "simplified", "but — ZH-only"],
  ["虽然", "〜にもかかわらず", "simplified", "although — ZH-only"],
  ["或者", "または", "simplified", "or — ZH-only"],
  ["并且", "そして", "simplified", "and — ZH-only"],
  ["只是", "ただ", "simplified", "just — ZH-only"],
  ["可以", "できます", "simplified", "can — ZH grammar"],
  ["需要", "必要", "simplified", "need — ZH prefers 需要, JP prefers 必要"],
  ["使用", "使用", "skip", "same in both — skip"],
  ["通过", "を通じて", "simplified", "through — ZH-only"],
  ["进行", "行う", "simplified", "carry out — ZH-only"],
  ["提供", "提供", "skip", "same in both — skip"],

  // ── Category 4: AI/ML specific terms ──

  ["模型", "モデル", "ai", "model — JP uses both but モデル more common"],
  ["训练", "トレーニング", "ai", "training"],
  ["推理", "推論", "ai", "inference"],
  ["权重", "重み", "ai", "weights"],
  ["采样", "サンプリング", "ai", "sampling"],
  ["采样器", "サンプラー", "ai", "sampler"],
  ["生成", "生成", "skip", "same in both"],
  ["噪声", "ノイズ", "ai", "noise"],
  ["去噪", "ノイズ除去", "ai", "denoise"],
  ["分辨率", "解像度", "ai", "resolution"],
  ["提示词", "プロンプト", "ai", "prompt"],
  ["正面提示词", "ポジティブプロンプト", "ai", "positive prompt"],
  ["负面提示词", "ネガティブプロンプト", "ai", "negative prompt"],
  ["潜空间", "潜在空間", "ai", "latent space"],
  ["编码器", "エンコーダー", "ai", "encoder"],
  ["解码器", "デコーダー", "ai", "decoder"],
  ["扩散", "拡散", "ai", "diffusion — same meaning but 扩 is simplified"],
  ["裁剪", "切り抜き", "ai", "crop/trim"],
  ["抖动", "ディザリング", "ai", "dithering"],
  ["抖動", "ディザリング", "ai", "dithering (traditional)"],
  ["插值", "補間", "ai", "interpolation"],
  ["放大", "アップスケール", "ai", "upscale"],
  ["缩放", "スケーリング", "ai", "scaling"],
  ["蒙版", "マスク", "ai", "mask"],
  ["遮罩", "マスク", "ai", "mask (alternative)"],
  ["图层", "レイヤー", "ai", "layer"],
  ["渲染", "レンダリング", "ai", "rendering"],
  ["管道", "パイプライン", "ai", "pipeline"],
  ["工作流", "ワークフロー", "ai", "workflow"],
  ["节点", "ノード", "ai", "node"],
  ["自定义", "カスタム", "ai", "custom"],
  ["自定义节点", "カスタムノード", "ai", "custom node"],
  ["预览", "プレビュー", "ai", "preview"],
  ["批处理", "バッチ処理", "ai", "batch processing"],
  ["队列", "キュー", "ai", "queue"],

  // ── Category 5: Image/video processing ──

  ["亮度", "明度", "image", "brightness"],
  ["对比度", "コントラスト", "image", "contrast"],
  ["饱和度", "彩度", "image", "saturation"],
  ["色调", "色相", "image", "hue"],
  ["模糊", "ぼかし", "image", "blur"],
  ["锐化", "シャープ化", "image", "sharpen"],
  ["旋转", "回転", "image", "rotate"],
  ["翻转", "反転", "image", "flip"],
  ["混合", "ブレンド", "skip", "blend — 混合 is valid Japanese (こんごう), skip"],
  ["合成", "合成", "skip", "same in both"],
  ["透明度", "透明度", "skip", "transparency — valid in both languages, skip"],
];

/** Get only actionable entries (skip nulls and "skip" category) */
export function getActiveDict() {
  return ZH_JA_DICT.filter(([, ja, cat]) => cat !== "skip" && ja != null);
}
