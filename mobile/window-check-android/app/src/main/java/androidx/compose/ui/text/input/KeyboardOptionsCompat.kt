@file:Suppress("PackageDirectoryMismatch")

package androidx.compose.ui.text.input

/**
 * Temporary source-compatibility alias for the initial internal MVP.
 *
 * ResultScreens.kt was authored against the former import path while the
 * current Compose release exposes KeyboardOptions from foundation.text.
 * Replace the import in ResultScreens.kt and remove this alias during the
 * next screen-file cleanup.
 */
typealias KeyboardOptions = androidx.compose.foundation.text.KeyboardOptions
