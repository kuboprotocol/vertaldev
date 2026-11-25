// Projeto Android mínimo do Vertal Node (app de teste; um SDK por flavor).
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
        // Cash Raven SDK (io.cashraven:cr-sdk)
        maven { url = uri("https://cashraven-downloads.nyc3.digitaloceanspaces.com/maven") }
    }
}
rootProject.name = "vertal-node-android"
include(":app")
