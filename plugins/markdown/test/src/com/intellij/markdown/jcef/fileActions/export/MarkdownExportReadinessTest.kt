// Copyright 2000-2026 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
package com.intellij.markdown.jcef.fileActions.export

import com.intellij.markdown.jcef.preview.MarkdownJCEFHtmlPanel
import com.intellij.markdown.jcef.preview.impl.executeCancellableJavaScript
import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.application.EDT
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.common.timeoutRunBlocking
import com.intellij.testFramework.junit5.RegistryKey
import com.intellij.testFramework.junit5.fixture.projectFixture
import com.intellij.ui.jcef.JBCefNativeBundleProvider
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext
import org.intellij.plugins.markdown.fileActions.export.MarkdownExportProvider
import org.intellij.plugins.markdown.preview.jcef.MarkdownJcefTestCase
import org.intellij.plugins.markdown.preview.jcef.MarkdownPreviewTest
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.junit.jupiter.api.condition.EnabledIfSystemProperty
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import kotlin.time.Duration.Companion.seconds

@EnabledIfSystemProperty(named = "intellij.test.standalone", matches = "^true$")
@MarkdownPreviewTest
@RegistryKey(key = "ide.browser.jcef.testMode.enabled", value = "true")
@RegistryKey(key = "ide.browser.jcef.enabled", value = "true")
@RegistryKey(key = "ide.browser.jcef.headless.enabled", value = "true")
@Timeout(30)
class MarkdownExportReadinessTest : MarkdownJcefTestCase() {
  @BeforeEach
  fun configureNativeBundle() {
    val bundlePath = System.getProperty("jcef.test.native.bundle.path") ?: return
    val provider = object : JBCefNativeBundleProvider {
      override fun isAvailable(): Boolean = true
      override fun getNativeBundlePath(): String = bundlePath
    }
    ExtensionTestUtil.maskExtensions(JBCefNativeBundleProvider.EP, listOf(provider), disposable)
  }

  @Test
  fun `export waits for every diagram`() = timeoutRunBlocking {
    val panel = createPanel("""
      <div class="mermaid" data-actual-fence-content="Zmlyc3Q="><svg></svg></div>
      <div class="mermaid" data-actual-fence-content="c2Vjb25k"></div>
    """.trimIndent())
    val export = async(start = CoroutineStart.UNDISPATCHED) { panel.waitForExport() }
    panel.executeCancellableJavaScript("Promise.resolve()")
    assertFalse(export.isCompleted)
    panel.executeCancellableJavaScript("""
      (async function() {
        document.querySelectorAll("div.mermaid")[1].innerHTML = "<svg><text>Ready</text></svg>";
      })()
    """.trimIndent())
    export.await()
  }

  @Test
  fun `export rejects a failed diagram`() = timeoutRunBlocking {
    val panel = createPanel("""
      <div class="mermaid" data-actual-fence-content="ZmFpbGVk"><div class="error-text">Invalid diagram</div></div>
    """.trimIndent())
    val failure = runCatching { panel.waitForExport() }.exceptionOrNull()
    assertTrue(failure?.message.orEmpty().contains("Mermaid rendering failed"))
  }

  @Test
  fun `export supports documents without diagrams`() = timeoutRunBlocking {
    val panel = createPanel("<h1>A Markdown document</h1>")
    panel.waitForExport()
  }

  @Test
  fun `PDF exporter creates a PDF file`(@TempDir directory: Path) = timeoutRunBlocking(timeout = 25.seconds) {
    val project = projectFixture.get()
    val source = directory.resolve("document.md")
    Files.writeString(source, "# Exported document\n\nA document with **formatted text**.\n")
    val file = checkNotNull(VfsUtil.findFile(source, true))
    val output = directory.resolve("document.pdf")
    val result = Channel<String>(Channel.CONFLATED)
    project.messageBus.connect(disposable).subscribe(Notifications.TOPIC, object : Notifications {
      override fun notify(notification: Notification) {
        notification.displayId?.takeIf { it.startsWith("markdown.export.") }?.let { result.trySend(it) }
      }
    })
    val provider = MarkdownExportProvider.allProviders.single { it.formatDescription.extension == "pdf" }
    withContext(Dispatchers.EDT) {
      provider.exportFile(project, file, output.toString())
    }
    assertEquals("markdown.export.success", result.receive())
    assertTrue(Files.readAllBytes(output).take(5).toByteArray().contentEquals("%PDF-".toByteArray()))
  }

  private suspend fun createPanel(content: String): MarkdownJCEFHtmlPanel {
    val panel = withContext(Dispatchers.EDT) {
      createPreview().apply { createImmediately() }
    }
    panel.setHtmlAndWait(content)
    return panel
  }

  companion object {
    private val projectFixture = projectFixture()
  }
}
