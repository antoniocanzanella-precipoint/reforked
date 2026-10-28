// Copyright 2000-2026 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
package com.intellij.markdown.jcef.fileActions.export

import com.intellij.markdown.jcef.preview.MarkdownJCEFHtmlPanel
import com.intellij.markdown.jcef.preview.impl.executeCancellableJavaScript
import kotlinx.coroutines.withTimeoutOrNull
import org.jetbrains.annotations.ApiStatus

@ApiStatus.Internal
suspend fun MarkdownJCEFHtmlPanel.waitForExport() {
  val ready = withTimeoutOrNull(30_000) {
    // language=JavaScript
    executeCancellableJavaScript("""
      (async function() {
        await new Promise((resolve, reject) => {
          const observer = new MutationObserver(check);
          const timeout = setTimeout(() => finish(new Error("Mermaid rendering timed out")), 25000);
          function finish(error) {
            observer.disconnect();
            clearTimeout(timeout);
            error ? reject(error) : resolve();
          }
          function check() {
            const diagrams = Array.from(document.querySelectorAll("div.mermaid[data-actual-fence-content]"))
              .filter(block => block.getAttribute("data-actual-fence-content"));
            if (diagrams.some(block => block.querySelector(".error-text"))) {
              finish(new Error("Mermaid rendering failed"));
            }
            else if (diagrams.every(block => block.querySelector("svg"))) {
              finish();
            }
          }
          observer.observe(document.body, { childList: true, subtree: true });
          check();
        });
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => {
          if (image.complete) return Promise.resolve();
          return new Promise(resolve => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }));
      })()
    """.trimIndent())
    true
  }
  check(ready == true) { "The Markdown preview did not finish rendering" }
}
