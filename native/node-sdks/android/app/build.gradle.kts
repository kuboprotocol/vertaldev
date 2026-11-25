// app/build.gradle.kts do app Android Vertal Node (app de teste mínimo: uma tela com marca Vertal).
//
// Um flavor por provedor: cada APK leva UM SDK de compartilhamento de banda só (sem conflito nem
// problema de exclusividade). Escolha com -PNODE_SDK_PROVIDER=cashraven|honeygain|bright (ou a env
// NODE_SDK_PROVIDER; padrão cashraven) ou rode a task do flavor: assembleCashravenRelease /
// assembleHoneygainRelease / assembleBrightRelease.
//   honeygain: aguardando aprovação do Honeygain (código intacto, só não é o padrão).
//   bright: adapter pronto, desligado até a Bright aprovar (-PNODE_SDK_BRIGHT_APPROVED=1 liga).
//   pawns / infatica / earnfm: aguardando aprovação dos parceiros (sem flavor ainda).
//
// Chaves/IDs: um por provedor, do app ANDROID (diferente da desktop), em ~/.gradle/gradle.properties
// ou variável de ambiente — nunca no repositório:
//   CASHRAVEN_API_KEY_ANDROID, HONEYGAIN_API_KEY_ANDROID (ou HONEYGAIN_API_KEY, legado),
//   BRIGHT_SDK_APP_ID_ANDROID (App ID do painel Bright; no Android é o packageName do app),
//   VERTAL_SUPABASE_URL, VERTAL_SUPABASE_ANON_KEY

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun prop(name: String): String = (project.findProperty(name) ?: System.getenv(name) ?: "").toString()

val nodeSdkProvider = prop("NODE_SDK_PROVIDER").ifBlank { "cashraven" }.lowercase()

android {
    namespace = "dev.vertal.node"
    compileSdk = 34 // Cash Raven exige compile/targetSdk 34
    defaultConfig {
        applicationId = "dev.vertal.node"
        minSdk = 24
        targetSdk = 34
        versionCode = prop("VERTAL_NODE_VERSION_CODE").ifBlank { "1" }.toInt()
        versionName = prop("VERTAL_NODE_VERSION_NAME").ifBlank { "0.1.0-test" }
        buildConfigField("String", "VERTAL_SUPABASE_URL", "\"${prop("VERTAL_SUPABASE_URL")}\"")
        buildConfigField("String", "VERTAL_SUPABASE_ANON_KEY", "\"${prop("VERTAL_SUPABASE_ANON_KEY")}\"")
    }
    flavorDimensions += "nodeSdk"
    productFlavors {
        create("honeygain") {
            dimension = "nodeSdk"
            minSdk = 21 // mínimo do Honeygain SDK
            buildConfigField(
                "String", "NODE_SDK_API_KEY",
                "\"${prop("HONEYGAIN_API_KEY_ANDROID").ifBlank { prop("HONEYGAIN_API_KEY") }}\""
            )
        }
        create("cashraven") {
            dimension = "nodeSdk"
            minSdk = 24 // mínimo do Cash Raven SDK 4.1.4
            buildConfigField("String", "NODE_SDK_API_KEY", "\"${prop("CASHRAVEN_API_KEY_ANDROID")}\"")
        }
        create("bright") {
            dimension = "nodeSdk"
            // O guia da Bright não fixa minSdk (só Java 8+); fica o do app.
            buildConfigField("String", "NODE_SDK_API_KEY", "\"${prop("BRIGHT_SDK_APP_ID_ANDROID")}\"")
            // Desligado até a Bright aprovar o app (status Implementation no painel).
            buildConfigField("boolean", "NODE_SDK_BRIGHT_APPROVED", (prop("NODE_SDK_BRIGHT_APPROVED") == "1").toString())
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17 // Cash Raven: JDK 17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
    lint { abortOnError = false; checkReleaseBuilds = false }
}

// Só o flavor escolhido é montado: evita compilar (e precisar do binário de) outro SDK.
androidComponents {
    beforeVariants { variant ->
        if (variant.productFlavors.none { it.second == nodeSdkProvider }) variant.enable = false
    }
}

// Repositório Maven da Cash Raven: em settings.gradle.kts (dependencyResolutionManagement).

dependencies {
    // Comuns (manager + heartbeat)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2") // DeepLinkTest (JVM puro): ./gradlew testCashravenDebugUnitTest

    // Honeygain: hgsdk.aar do dashboard (scripts/fetch-sdk.sh honeygain android), NÃO commitado.
    "honeygainImplementation"(files("libs/hgsdk.aar"))
    "honeygainImplementation"("org.msgpack:msgpack-core:0.9.11")
    "honeygainImplementation"("com.google.protobuf:protobuf-javalite:3.25.3")

    // Cash Raven 4.1.4 (Maven da Cash Raven). Offline: -PCASHRAVEN_OFFLINE=1 usa libs/cashraven/*.aar.
    if (prop("CASHRAVEN_OFFLINE") == "1") {
        "cashravenImplementation"(fileTree("libs/cashraven") { include("*.aar") })
    } else {
        "cashravenImplementation"("io.cashraven:cr-sdk:4.1.4")
    }
    "cashravenImplementation"("net.java.dev.jna:jna:5.14.0@aar")

    // Bright SDK: bright_sdk.aar (Bright SDK Downloader ou plugin Gradle com SDK_API_KEY) em
    // libs/bright/ via scripts/fetch-sdk.sh bright android <arquivo>; NÃO commitado.
    // ProGuard (proguard-rules.pro do flavor): -dontnote brdat.sdk.**
    "brightImplementation"(fileTree("libs/bright") { include("*.aar") })
    "brightImplementation"("androidx.core:core:1.9.0")
    "brightImplementation"("androidx.constraintlayout:constraintlayout:2.1.4")
}
