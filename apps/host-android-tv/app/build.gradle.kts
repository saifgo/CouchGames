plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val repoRoot = rootDir.resolve("../..")

android {
    namespace = "app.couch.tv"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.couch.tv"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.3.0"
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sideload builds are signed with the debug key until a release keystore exists.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // Shared golden vectors: the Kotlin codec must decode the same bytes as TypeScript.
    sourceSets.getByName("test").resources.directories.add(repoRoot.resolve("packages/protocol/vectors").path)
    packaging { jniLibs { useLegacyPackaging = true } }
}

kotlin { jvmToolchain(21) }

/** Copies the built phone controller (apps/controller-web/dist) and the systems catalog into assets. */
val prepareWebAssets = tasks.register<Copy>("prepareWebAssets") {
    val dist = repoRoot.resolve("apps/controller-web/dist")
    val systems = repoRoot.resolve("packages/systems/dist/systems.json")
    doFirst {
        require(dist.resolve("index.html").exists()) { "Run `pnpm --filter @couch/controller-web build` first" }
        require(systems.exists()) { "Run `pnpm --filter @couch/systems export-json` first" }
    }
    from(dist) { into("controller") }
    from(systems)
    into(layout.projectDirectory.dir("src/main/assets"))
}
tasks.named("preBuild") { dependsOn(prepareWebAssets) }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material.icons)
    implementation(libs.tv.material)
    implementation(libs.tvprovider)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.ktor.server.cio)
    implementation(libs.ktor.server.websockets)
    implementation(libs.webrtc)
    implementation(libs.libretrodroid)
    implementation(libs.zxing.core)
    implementation(libs.coil.compose)
    implementation(libs.coil.network)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.serialization.json)
}
