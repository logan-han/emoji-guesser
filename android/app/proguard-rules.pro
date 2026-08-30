# Keep kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.emojiguesser.**$$serializer { *; }
-keepclassmembers class com.emojiguesser.** {
    *** Companion;
}
-keepclasseswithmembers class com.emojiguesser.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Compose
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# Konfetti
-keep class nl.dionsegijn.konfetti.** { *; }

# Firebase Messaging (no-op until enabled)
-keep class com.google.firebase.messaging.** { *; }
-dontwarn com.google.firebase.messaging.**
