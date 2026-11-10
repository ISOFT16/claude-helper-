plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.isoft16.vigillauncher"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.isoft16.vigillauncher"
        minSdk = 26
        targetSdk = 35
        // Каждая сборка на GitHub получает больший номер, чтобы APK ставился поверх старого.
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        // Постоянный ключ лежит в репозитории, чтобы обновления ставились без удаления приложения.
        create("release") {
            storeFile = rootProject.file("keystore/vigil-launcher.jks")
            storePassword = "vigillauncher"
            keyAlias = "vigil"
            keyPassword = "vigillauncher"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}
