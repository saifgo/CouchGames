import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.Properties
import java.util.zip.ZipInputStream

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val repoRoot = rootDir.resolve("../..")
val appVersion = "0.4.1"

// APK file name: CoucheTV-<version>-<debug|release>.apk
base { archivesName.set("CoucheTV-$appVersion") }

android {
    namespace = "app.couch.tv"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.tunisolutions.couch"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = appVersion
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }

    // Play upload key. keystore.properties and the .jks live outside git; without them release falls back to debug signing.
    val keystoreFile = rootDir.resolve("keystore.properties")
    if (keystoreFile.exists()) {
        val props = Properties()
        keystoreFile.reader().use { props.load(it) }
        signingConfigs.create("upload") {
            storeFile = file(props.getProperty("storeFile"))
            storePassword = props.getProperty("storePassword")
            keyAlias = props.getProperty("keyAlias")
            keyPassword = props.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
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

/**
 * Emulator cores are bundled as native libraries: Google Play does not allow downloading
 * executable code at runtime. Every Android core in the systems catalog (defaults and
 * alternatives) is fetched from the libretro buildbot at build time into a git-ignored cache
 * (.cores-cache/, never committed), renamed lib<core>_libretro_android.so so the installer
 * extracts it to nativeLibraryDir, and added to jniLibs. Pass -PrefreshCores to re-download.
 */
abstract class FetchCores : DefaultTask() {
    @get:InputFile abstract val systemsJson: RegularFileProperty
    @get:Input abstract val abis: ListProperty<String>
    @get:Input abstract val refresh: Property<Boolean>
    @get:Internal abstract val cacheDir: DirectoryProperty
    @get:OutputDirectory abstract val outputDir: DirectoryProperty

    @TaskAction
    fun run() {
        @Suppress("UNCHECKED_CAST")
        val systems = (groovy.json.JsonSlurper().parse(systemsJson.get().asFile) as Map<String, Any>)["systems"] as List<Map<String, Any>>
        val cores = sortedSetOf<String>()
        for (s in systems) {
            @Suppress("UNCHECKED_CAST")
            val android = s["android"] as Map<String, Any>
            @Suppress("UNCHECKED_CAST")
            cores += android["cores"] as List<String>
            @Suppress("UNCHECKED_CAST")
            (android["byExtension"] as Map<String, List<String>>?)?.values?.forEach { cores += it }
        }
        val out = outputDir.get().asFile.apply { deleteRecursively(); mkdirs() }
        val missing = mutableListOf<String>()
        for (abi in abis.get()) {
            val cache = cacheDir.get().asFile.resolve(abi).apply { mkdirs() }
            for (core in cores) {
                val lib = "lib${core}_libretro_android.so"
                val cached = cache.resolve(lib)
                if (refresh.get() || !cached.exists()) {
                    if (!download(abi, core, cached)) {
                        missing += "$core ($abi)"
                        continue
                    }
                }
                cached.copyTo(out.resolve("$abi/$lib"), overwrite = true)
            }
        }
        logger.lifecycle("Bundled ${cores.size} cores for ${abis.get().joinToString()}" + if (missing.isEmpty()) "" else "; not built upstream: ${missing.joinToString()}")
    }

    private fun download(abi: String, core: String, dest: File): Boolean {
        val url = URI("https://buildbot.libretro.com/nightly/android/latest/$abi/${core}_libretro_android.so.zip").toURL()
        val conn = (url.openConnection() as HttpURLConnection).apply { connectTimeout = 20_000; readTimeout = 60_000 }
        try {
            if (conn.responseCode == 404) return false
            check(conn.responseCode == 200) { "HTTP ${conn.responseCode} for $url" }
            val tmp = File(dest.path + ".tmp")
            ZipInputStream(conn.inputStream).use { zip ->
                generateSequence { zip.nextEntry }.firstOrNull { it.name.endsWith(".so") } ?: error("no .so in $url")
                tmp.outputStream().use { zip.copyTo(it) }
            }
            check(tmp.length() > 0) { "empty core from $url" }
            if (dest.exists()) dest.delete()
            check(tmp.renameTo(dest)) { "could not write $dest" }
            return true
        } finally {
            conn.disconnect()
        }
    }
}

val fetchCores = tasks.register<FetchCores>("fetchCores") {
    systemsJson.set(repoRoot.resolve("packages/systems/dist/systems.json"))
    abis.set(listOf("arm64-v8a", "armeabi-v7a", "x86_64"))
    refresh.set(providers.gradleProperty("refreshCores").isPresent)
    cacheDir.set(rootDir.resolve(".cores-cache"))
    outputDir.set(layout.buildDirectory.dir("generated/cores"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.jniLibs?.addGeneratedSourceDirectory(fetchCores, FetchCores::outputDir)
    }
}

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
    implementation(libs.okhttp)
    implementation(libs.billing)
    implementation(libs.androidx.fragment)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.serialization.json)
}
