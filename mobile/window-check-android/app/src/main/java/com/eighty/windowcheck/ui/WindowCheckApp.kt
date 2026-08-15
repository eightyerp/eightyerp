package com.eighty.windowcheck.ui

import android.content.ActivityNotFoundException
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.eighty.windowcheck.data.FakeDiagnosisRepository
import com.eighty.windowcheck.model.CaptureType
import com.eighty.windowcheck.model.CapturedPhoto
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.ExtraInfo
import com.eighty.windowcheck.model.VisitRequest
import com.eighty.windowcheck.ui.screens.AnalysisScreen
import com.eighty.windowcheck.ui.screens.CaptureGuideScreen
import com.eighty.windowcheck.ui.screens.CaptureScreen
import com.eighty.windowcheck.ui.screens.CompleteScreen
import com.eighty.windowcheck.ui.screens.DetailResultScreen
import com.eighty.windowcheck.ui.screens.ExtraInfoScreen
import com.eighty.windowcheck.ui.screens.HistoryPlaceholderScreen
import com.eighty.windowcheck.ui.screens.ReportScreen
import com.eighty.windowcheck.ui.screens.ResultSummaryScreen
import com.eighty.windowcheck.ui.screens.SolutionScreen
import com.eighty.windowcheck.ui.screens.StartScreen
import com.eighty.windowcheck.ui.screens.VisitRequestScreen
import com.eighty.windowcheck.util.createCaptureUri
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay

enum class AppScreen {
    START,
    HISTORY,
    GUIDE,
    CAPTURE,
    ANALYZING,
    RESULT,
    DETAIL,
    EXTRA_INFO,
    REPORT,
    SOLUTION,
    VISIT_REQUEST,
    COMPLETE,
}

@Composable
fun WindowCheckApp() {
    val context = LocalContext.current
    val repository = remember { FakeDiagnosisRepository() }

    var screen by remember { mutableStateOf(AppScreen.START) }
    var currentCaptureIndex by remember { mutableIntStateOf(0) }
    val photos = remember { mutableStateMapOf<CaptureType, CapturedPhoto>() }
    var latestPhotoUri by remember { mutableStateOf<Uri?>(null) }
    var pendingCaptureType by remember { mutableStateOf<CaptureType?>(null) }
    var pendingCaptureUri by remember { mutableStateOf<Uri?>(null) }
    var analysisProgress by remember { mutableFloatStateOf(0f) }
    var result by remember { mutableStateOf<DiagnosisResult?>(null) }
    var extraInfo by remember { mutableStateOf(ExtraInfo()) }
    var visitRequest by remember { mutableStateOf(VisitRequest()) }

    fun reset() {
        photos.clear()
        currentCaptureIndex = 0
        latestPhotoUri = null
        pendingCaptureType = null
        pendingCaptureUri = null
        analysisProgress = 0f
        result = null
        extraInfo = ExtraInfo()
        visitRequest = VisitRequest()
        screen = AppScreen.START
    }

    fun navigateBack() {
        screen = when (screen) {
            AppScreen.START -> AppScreen.START
            AppScreen.HISTORY -> AppScreen.START
            AppScreen.GUIDE -> AppScreen.START
            AppScreen.CAPTURE -> {
                if (currentCaptureIndex > 0) {
                    currentCaptureIndex -= 1
                    val previousType = CaptureType.entries[currentCaptureIndex]
                    latestPhotoUri = photos[previousType]?.uri
                    AppScreen.CAPTURE
                } else {
                    AppScreen.GUIDE
                }
            }
            AppScreen.ANALYZING -> AppScreen.CAPTURE
            AppScreen.RESULT -> AppScreen.CAPTURE
            AppScreen.DETAIL -> AppScreen.RESULT
            AppScreen.EXTRA_INFO -> AppScreen.DETAIL
            AppScreen.REPORT -> AppScreen.EXTRA_INFO
            AppScreen.SOLUTION -> AppScreen.REPORT
            AppScreen.VISIT_REQUEST -> if (result == null) AppScreen.START else AppScreen.REPORT
            AppScreen.COMPLETE -> AppScreen.START
        }
    }

    BackHandler(enabled = screen != AppScreen.START) {
        navigateBack()
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        val type = pendingCaptureType
        val uri = pendingCaptureUri
        if (success && type != null && uri != null) {
            photos[type] = CapturedPhoto(type = type, uri = uri)
            latestPhotoUri = uri
        } else if (!success) {
            Toast.makeText(context, "촬영이 취소되었습니다.", Toast.LENGTH_SHORT).show()
        }
        pendingCaptureType = null
        pendingCaptureUri = null
    }

    fun launchCamera() {
        val type = CaptureType.entries[currentCaptureIndex]
        val uri = context.createCaptureUri()
        pendingCaptureType = type
        pendingCaptureUri = uri
        try {
            cameraLauncher.launch(uri)
        } catch (_: ActivityNotFoundException) {
            pendingCaptureType = null
            pendingCaptureUri = null
            Toast.makeText(context, "사용 가능한 카메라 앱이 없습니다.", Toast.LENGTH_LONG).show()
        }
    }

    LaunchedEffect(screen, photos.size) {
        if (screen != AppScreen.ANALYZING || photos.isEmpty()) return@LaunchedEffect

        analysisProgress = 0f
        runCatching {
            coroutineScope {
                val analysis = async { repository.analyze(photos.values.toList()) }
                repeat(24) { step ->
                    delay(100)
                    analysisProgress = ((step + 1) / 24f).coerceAtMost(0.98f)
                }
                result = analysis.await()
            }
        }.onFailure {
            Toast.makeText(context, "분석 중 오류가 발생했습니다.", Toast.LENGTH_LONG).show()
            screen = AppScreen.CAPTURE
            return@LaunchedEffect
        }
        analysisProgress = 1f
        delay(350)
        screen = AppScreen.RESULT
    }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding(),
        color = MaterialTheme.colorScheme.background,
    ) {
        when (screen) {
            AppScreen.START -> StartScreen(
                onStart = { screen = AppScreen.GUIDE },
                onHistory = { screen = AppScreen.HISTORY },
            )

            AppScreen.HISTORY -> HistoryPlaceholderScreen(onBack = ::navigateBack)

            AppScreen.GUIDE -> CaptureGuideScreen(
                onBack = ::navigateBack,
                onStartCapture = {
                    currentCaptureIndex = 0
                    latestPhotoUri = photos[CaptureType.entries.first()]?.uri
                    screen = AppScreen.CAPTURE
                },
            )

            AppScreen.CAPTURE -> CaptureScreen(
                currentIndex = currentCaptureIndex,
                capturedCount = photos.size,
                latestPhotoUri = latestPhotoUri,
                onBack = ::navigateBack,
                onCapture = ::launchCamera,
                onRetake = ::launchCamera,
                onNext = {
                    if (currentCaptureIndex >= CaptureType.entries.lastIndex) {
                        if (photos.size == CaptureType.entries.size) {
                            screen = AppScreen.ANALYZING
                        } else {
                            Toast.makeText(context, "필수 사진 5장을 모두 촬영해 주세요.", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        currentCaptureIndex += 1
                        val nextType = CaptureType.entries[currentCaptureIndex]
                        latestPhotoUri = photos[nextType]?.uri
                    }
                },
            )

            AppScreen.ANALYZING -> AnalysisScreen(progress = analysisProgress)

            AppScreen.RESULT -> result?.let { diagnosis ->
                ResultSummaryScreen(
                    result = diagnosis,
                    onBack = ::navigateBack,
                    onDetail = { screen = AppScreen.DETAIL },
                    onVisit = { screen = AppScreen.VISIT_REQUEST },
                )
            }

            AppScreen.DETAIL -> result?.let { diagnosis ->
                DetailResultScreen(
                    result = diagnosis,
                    onBack = ::navigateBack,
                    onNext = { screen = AppScreen.EXTRA_INFO },
                )
            }

            AppScreen.EXTRA_INFO -> ExtraInfoScreen(
                info = extraInfo,
                onInfoChange = { extraInfo = it },
                onBack = ::navigateBack,
                onSubmit = { screen = AppScreen.REPORT },
            )

            AppScreen.REPORT -> result?.let { diagnosis ->
                ReportScreen(
                    result = diagnosis,
                    info = extraInfo,
                    onBack = ::navigateBack,
                    onSolution = { screen = AppScreen.SOLUTION },
                    onVisit = { screen = AppScreen.VISIT_REQUEST },
                )
            }

            AppScreen.SOLUTION -> SolutionScreen(
                onBack = ::navigateBack,
                onVisit = { screen = AppScreen.VISIT_REQUEST },
            )

            AppScreen.VISIT_REQUEST -> VisitRequestScreen(
                request = visitRequest,
                onRequestChange = { visitRequest = it },
                onBack = ::navigateBack,
                onSubmit = { screen = AppScreen.COMPLETE },
            )

            AppScreen.COMPLETE -> CompleteScreen(onRestart = ::reset)
        }
    }
}
