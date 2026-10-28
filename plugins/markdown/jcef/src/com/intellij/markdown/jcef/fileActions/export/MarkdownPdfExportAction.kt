// Copyright 2000-2026 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
package com.intellij.markdown.jcef.fileActions.export

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import org.intellij.plugins.markdown.MarkdownBundle
import org.intellij.plugins.markdown.extensions.jcef.commandRunner.TrustedProjectUtil
import org.intellij.plugins.markdown.fileActions.MarkdownFileActionsBaseDialog
import org.intellij.plugins.markdown.lang.MarkdownFileType

internal class MarkdownPdfExportAction : AnAction() {
  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    val file = getMarkdownFile(event) ?: return
    TrustedProjectUtil.executeIfTrusted(project) {
      PdfExportDialog(project, file).show()
    }
  }

  override fun update(event: AnActionEvent) {
    event.presentation.isEnabledAndVisible = event.project != null && getMarkdownFile(event) != null
  }

  override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

  private fun getMarkdownFile(event: AnActionEvent): VirtualFile? {
    val file = event.getData(PlatformDataKeys.FILE_EDITOR)?.file ?: event.getData(CommonDataKeys.VIRTUAL_FILE)
    return file?.takeIf { it.fileType is MarkdownFileType }
  }
}

private class PdfExportDialog(project: Project, file: VirtualFile) : MarkdownFileActionsBaseDialog(project, file.path, file) {
  init {
    title = MarkdownBundle.message("action.Markdown.ExportPdf.text")
    setOKButtonText(MarkdownBundle.message("markdown.export.dialog.ok.button"))
    okAction.isEnabled = MarkdownPdfExportProvider().validate(project, file) == null
  }

  override fun doAction(selectedFileUrl: String) {
    MarkdownPdfExportProvider().exportFile(project, file, "$selectedFileUrl.pdf")
  }

  override fun getFileNameIfExist(dir: String, fileNameWithoutExtension: String): String? {
    val name = "$fileNameWithoutExtension.pdf"
    return name.takeIf { FileUtil.exists(FileUtil.join(dir, it)) }
  }
}
