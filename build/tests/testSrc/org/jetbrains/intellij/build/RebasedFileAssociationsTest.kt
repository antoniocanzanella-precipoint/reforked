// Copyright 2026. Use of this source code is governed by the Apache 2.0 license.
package org.jetbrains.intellij.build

import org.jetbrains.intellij.build.BuildPaths.Companion.COMMUNITY_ROOT
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RebasedFileAssociationsTest {
  @Test
  fun `Windows installation preserves default applications`() {
    val customizer = ideaCommunityWindowsCustomizer(COMMUNITY_ROOT.communityRoot)
    assertFalse(customizer.associateIpr)
    assertTrue(customizer.fileAssociations.isEmpty())
  }

  @Test
  fun `macOS installation preserves default applications`() {
    val customizer = ideaCommunityMacCustomizer(COMMUNITY_ROOT.communityRoot)
    assertFalse(customizer.associateIpr)
    assertTrue(customizer.fileAssociations.isEmpty())
    assertTrue(customizer.additionalDocTypes.isEmpty())
  }
}
