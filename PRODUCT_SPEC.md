# 社会ニーズ発見レーダー 仕様書

最終更新日：2026年7月19日
状態：GitHub IssuesとHacker Newsの候補を取得し、検索・絞り込み・並べ替え・課題らしさ目安・個別保存・保存済み課題整理・JSONバックアップができる状態

## 1. 長期ビジョン

AIが合法的かつ技術的に利用可能な公開情報を継続的に調査し、社会課題やビジネス機会の仮説を整理するAI市場調査エージェントを目指す。AIの分析は事実や成功確率ではなく仮説として扱い、人間が情報源、支払い意欲、法律・規約・倫理面を確認する。

## 2. 現在のMVP

現在はブラウザだけで使える静的アプリとして、課題候補を保存・整理・バックアップする土台を作っている。データは `localStorage` の `marketNeeds.v1` に保存する。

### できること

* 手動課題の追加、編集、削除、一覧表示
* ページ再読み込み後の復元
* GitHub Issuesの未完了Issue取得、Pull Request除外、候補表示、個別保存、重複防止
* Hacker News Search API（Algolia）による投稿検索、候補表示、個別保存、重複防止
* 保存前候補の検索、情報源・保存状態・最低コメント数・最低スコアによる絞り込み
* 保存前候補の課題らしさ順、新しい順、コメント数順、スコア順、取得順の安定ソート
* 取得総数、絞り込み後件数、未保存件数、保存済み件数の表示
* 条件リセット、取得結果の消去、保存済み候補の非表示
* 0〜100点の「課題らしさ目安」と主な加点・減点理由の表示
* Hacker Newsの取得件数（10/20/30/50）、取得順（新しい順/関連度または人気順）、投稿種別（すべて/Ask HN/Show HN）の指定
* Ask HN、Show HN、通常投稿の種別表示
* Hacker Newsの元記事URLとHN投稿URLの区別
* 保存済み課題への検討状態、自分用メモ、手動タグの付与
* 保存済み課題の状態、情報源、タグ、キーワード、課題らしさによる絞り込み
* 保存済み課題の登録日、更新日、課題らしさ、状態、タイトルによる並べ替え
* 保存済み課題だけを対象にしたJSON書き出し
* JSON読み込み前のサイズ、形式、件数、重複、不正件数の確認と追加・統合

## 3. データ構造

保存済み課題は主に次の項目を持つ。

* `id`
* `title`
* `description`
* `affected`
* `payer`
* `source`
* `sourceUrl`
* `externalId`
* `sourceType`
* `fetchedAt`
* `reviewStatus`
* `userMemo`
* `userTags`
* `problemSignalScore`
* `problemSignalReasons`
* `createdAt`
* `updatedAt`

古いデータに `reviewStatus`、`userMemo`、`userTags`、`problemSignalScore`、`problemSignalReasons`、`sourceType`、`sourceUrl`、`externalId`、`fetchedAt` がなくても、安全な初期値を補って読み込む。

## 4. 課題らしさ目安

課題らしさ目安はAI APIを使わない説明可能なルールで計算する。これは事業性、収益性、成功確率、AI評価ではない。

主な加点材料は、具体的な本文、困りごとを示す語、bug/problem/help wanted/enhancement系ラベル、複数コメント、Ask HN投稿など。主な減点材料は、本文なし、短い本文、依存関係更新、リリース作業、求人、告知、Show HNの製品紹介寄り投稿など。

## 5. JSONバックアップ仕様

書き出し形式は次のとおり。

```json
{
  "schemaVersion": 1,
  "exportedAt": "ISO日時",
  "appName": "社会ニーズ発見レーダー",
  "needs": []
}
```

一時的な取得候補は含めず、保存済み課題だけを書き出す。読み込み時は1MB以下、JSON解析、`needs` 配列、最低限のタイトル、重複を検証する。重複判定はID、`sourceType` と `externalId`、`sourceUrl`、タイトルと作成日時の完全一致を利用する。

## 6. 現時点では実装しない機能

* 生成AI API、翻訳API
* AIによる事業性判定、市場規模、収益性推定
* 自動巡回、バックグラウンド処理
* 新しい外部情報源
* ユーザーアカウント、クラウドDB、バックエンド
* 有料サービス
* APIキーのフロントエンド保存
* 大規模フレームワーク
