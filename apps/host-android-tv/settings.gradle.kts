pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // LibretroDroid is published on JitPack only.
        maven("https://jitpack.io") { content { includeGroup("com.github.Swordfish90") } }
    }
}
rootProject.name = "couch-tv"
include(":app")
