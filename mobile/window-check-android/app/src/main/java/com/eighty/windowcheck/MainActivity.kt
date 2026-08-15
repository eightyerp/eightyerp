package com.eighty.windowcheck

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.eighty.windowcheck.ui.WindowCheckApp
import com.eighty.windowcheck.ui.theme.EightyWindowCheckTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            EightyWindowCheckTheme {
                WindowCheckApp()
            }
        }
    }
}
