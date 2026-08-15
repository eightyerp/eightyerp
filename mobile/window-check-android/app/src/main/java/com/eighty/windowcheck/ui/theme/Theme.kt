package com.eighty.windowcheck.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val EightyBlue = Color(0xFF145BDF)
val EightyNavy = Color(0xFF0B2B61)
val EightySky = Color(0xFFEAF2FF)
val EightyBackground = Color(0xFFF7FAFF)
val EightyText = Color(0xFF12213D)
val EightyMuted = Color(0xFF657089)
val EightyBorder = Color(0xFFDCE4F2)
val EightyDanger = Color(0xFFE53E4D)
val EightyWarning = Color(0xFFF59E0B)
val EightySuccess = Color(0xFF16A36A)

private val LightColors = lightColorScheme(
    primary = EightyBlue,
    onPrimary = Color.White,
    primaryContainer = EightySky,
    onPrimaryContainer = EightyNavy,
    secondary = EightyNavy,
    onSecondary = Color.White,
    background = EightyBackground,
    onBackground = EightyText,
    surface = Color.White,
    onSurface = EightyText,
    surfaceVariant = Color(0xFFF1F5FB),
    onSurfaceVariant = EightyMuted,
    outline = EightyBorder,
    error = EightyDanger,
)

@Composable
fun EightyWindowCheckTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        content = content,
    )
}
