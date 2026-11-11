// Copyright 2000-2026 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
package org.jetbrains.intellij.build

import com.intellij.testFramework.common.timeoutRunBlocking
import org.jetbrains.intellij.build.BuildPaths.Companion.COMMUNITY_ROOT
import org.jetbrains.intellij.build.impl.createBuildContext
import org.jetbrains.intellij.build.impl.maven.MavenArtifactsBuilder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import kotlin.time.Duration.Companion.minutes

class ReforkedMavenArtifactsTest {
  @Test
  fun unpublishedJewelModulesKeepPlatformCoordinates(): Unit = timeoutRunBlocking(timeout = 1.minutes) {
    BuildLifetime().use { lifetime ->
      val context = createBuildContext(
        projectHome = COMMUNITY_ROOT.communityRoot,
        productProperties = RebasedProperties(COMMUNITY_ROOT.communityRoot),
        setupTracer = false,
        lifetime = lifetime,
      )
      val moduleName = "intellij.platform.jewel.ui"
      val artifactData = MavenArtifactsBuilder(context).generateMavenArtifactData(listOf(moduleName), ignoreNonMavenizable = false)
      val coordinates = artifactData.entries.single { it.key.name == moduleName }.value.coordinates

      assertEquals("com.jetbrains.intellij.platform", coordinates.groupId)
      assertEquals("jewel-ui", coordinates.artifactId)
    }
  }
}
