/**
 * メンテ用定数（上部に集約）
 */
/** @type {string} 検索する送信元メールアドレス（Gmail の from: にそのまま使える形） */
const SENDER_EMAIL = "notifications@example.com";

/** @type {number} 受信日時が「実行時からこの分数以内」のメールだけ対象 */
const MINUTES_WITHIN = 30;

/** @type {string} 前方一致で判定する所定の URL（スキーム込み推奨） */
const URL_PREFIX = "https://example.com/notify/";

/** @type {string} GCP Cloud Function の HTTPS エンドポイント（POST） */
const CLOUD_FUNCTION_URL =
  "https://REGION-PROJECT.cloudfunctions.net/your-function";

/**
 * メール本文から http(s) URL を拾う正規表現（必要に応じて調整）
 * 最初にマッチした順が「最初の1件」の候補順になる
 */
const URL_REGEX = /https?:\/\/[\w\-./?#&=%+~:@!$'()*+,;]+/gi;

/**
 * エントリポイント：トリガーまたは手動で実行
 */
function relay() {
  const cutoff = new Date(Date.now() - MINUTES_WITHIN * 60 * 1000);
  const query = "from:" + SENDER_EMAIL + " is:unread";
  const threads = GmailApp.search(query, 0, 100);

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      if (!message.isUnread()) {
        return;
      }
      if (message.getDate() < cutoff) {
        return;
      }

      var text = collectMessageText(message);
      var matches = text.match(URL_REGEX);

      if (matches && matches.length > 0) {
        for (var i = 0; i < matches.length; i++) {
          var candidate = normalizeUrl(matches[i]);
          if (candidate.indexOf(URL_PREFIX) === 0) {
            postUrlToCloudFunction(candidate);
            break;
          }
        }
      }

      message.markRead();
    });
  });
}

/**
 * プレーン + HTML から URL 探索用テキストを作る
 */
function collectMessageText(message) {
  var plain = message.getPlainBody() || "";
  var html = message.getBody() || "";
  return plain + "\n" + html;
}

/** 末尾の句読点などを軽く削る（必要なら） */
function normalizeUrl(s) {
  return s.replace(/[)\].,;]+$/g, "");
}

function postUrlToCloudFunction(url) {
  var token = ScriptApp.getIdentityToken();
  if (!token) {
    throw new Error("getIdentityToken() returned empty");
  }
  var payload = JSON.stringify({ url: url });
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: payload,
    muteHttpExceptions: true,
  };
  var response = UrlFetchApp.fetch(CLOUD_FUNCTION_URL, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      "Cloud Function HTTP " + code + ": " + response.getContentText(),
    );
  }
}
