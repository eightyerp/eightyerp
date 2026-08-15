package com.eighty.windowcheck.ui

import android.content.ActivityNotFoundException
import android.content.Intent
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.eighty.windowcheck.data.FakeDiagnosisRepository
import com.eighty.windowcheck.data.local.InspectionDraftCodec
import com.eighty.windowcheck.data.local.InspectionDraftEntity
import com.eighty.windowcheck.data.local.InspectionDraftSnapshot
import com.eighty.windowcheck.data.local.WindowCheckDatabase
import com.eighty.windowcheck.data.upload.WindowUploadScheduler
import com.eighty.windowcheck.model.CaptureType
import com.eighty.windowcheck.model.CapturedPhoto
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.EvidencePhoto
import com.eighty.windowcheck.model.EvidenceSlotKey
import com.eighty.windowcheck.model.EvidenceType
import com.eighty.windowcheck.model.InspectionSetup
import com.eighty.windowcheck.model.LocationCondition
import com.eighty.windowcheck.model.PhotoSlotKey
import com.eighty.windowcheck.model.QuoteAttachment
import com.eighty.windowcheck.model.StaffReview
import com.eighty.windowcheck.model.WindowLocation
import com.eighty.windowcheck.ui.screens.AnalysisScreen
import com.eighty.windowcheck.ui.screens.CaptureGuideScreen
import com.eighty.windowcheck.ui.screens.CaptureScreen
import com.eighty.windowcheck.ui.screens.CustomerReportScreen
import com.eighty.windowcheck.ui.screens.EmployeeDetailResultScreen
import com.eighty.windowcheck.ui.screens.EmployeeResultSummaryScreen
import com.eighty.windowcheck.ui.screens.HistoryPlaceholderScreen
import com.eighty.windowcheck.ui.screens.InspectionSetupScreen
import com.eighty.windowcheck.ui.screens.LocationSymptomsScreen
import com.eighty.windowcheck.ui.screens.MultiEvidencePhotosScreen
import com.eighty.windowcheck.ui.screens.SolutionScreen
import com.eighty.windowcheck.ui.screens.SpaceUnitSetupScreen
import com.eighty.windowcheck.ui.screens.StaffReviewScreen
import com.eighty.windowcheck.ui.screens.StartScreen
import com.eighty.windowcheck.util.GeneratedInspectionReport
import com.eighty.windowcheck.util.copyImageToCache
import com.eighty.windowcheck.util.createCaptureUri
import com.eighty.windowcheck.util.generateInspectionReportPdf
import com.eighty.windowcheck.util.getDisplayName
import com.eighty.windowcheck.util.shareInspectionReport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class AppScreen {
    START,
    HISTORY,
    SETUP,
    LOCATIONS,
    GUIDE,
    CAPTURE,
    EVIDENCE,
    ANALYZING,
    RESULT,
    DETAIL,
    SYMPTOMS,
    STAFF_REVIEW,
    CUSTOMER_REPORT,
    SOLUTION,
}

private data class PendingPhotoTarget(
    val location: WindowLocation,
    val captureType: CaptureType? = null,
    val evidenceType: EvidenceType? = null,
    val sequence: Int = 0,
)

@Composable
fun WindowCheckApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FakeDiagnosisRepository() }
    val draftDao = remember { WindowCheckDatabase.get(context).inspectionDraftDao() }

    var screen by remember { mutableStateOf(AppScreen.START) }
    var setup by remember { mutableStateOf(InspectionSetup()) }
    var locations by remember { mutableStateOf<List<WindowLocation>>(emptyList()) }
    var currentLocationIndex by remember { mutableIntStateOf(0) }
    var currentCaptureIndex by remember { mutableIntStateOf(0) }
    var currentSymptomIndex by remember { mutableIntStateOf(0) }

    val photos = remember { mutableStateMapOf<PhotoSlotKey, CapturedPhoto>() }
    val evidencePhotos = remember { mutableStateMapOf<EvidenceSlotKey, EvidencePhoto>() }
    val conditions = remember { mutableStateMapOf<String, LocationCondition>() }

    var pendingPhotoTarget by remember { mutableStateOf<PendingPhotoTarget?>(null) }
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    var analysisProgress by remember { mutableFloatStateOf(0f) }
    var result by remember { mutableStateOf<DiagnosisResult?>(null) }
    var staffReview by remember { mutableStateOf(StaffReview()) }
    var generatedReport by remember { mutableStateOf<GeneratedInspectionReport?>(null) }
    var quoteAttachment by remember { mutableStateOf<QuoteAttachment?>(null) }
    var isGeneratingReport by remember { mutableStateOf(false) }
    var draftLoaded by remember { mutableStateOf(false) }
    var hasSavedDraft by remember { mutableStateOf(false) }

    fun orderedPhotos(): List<CapturedPhoto> = locations.flatMap { location ->
        CaptureType.entries.flatMap { type ->
            photos.entries
                .filter { (key, _) -> key.locationId == location.id && key.type == type }
                .sortedBy { (key, _) -> key.sequence }
                .map { it.value }
        }
    }

    fun orderedEvidencePhotos(): List<EvidencePhoto> = locations.flatMap { location ->
        EvidenceType.entries.flatMap { type ->
            evidencePhotos.entries
                .filter { (key, _) -> key.locationId == location.id && key.type == type }
                .sortedBy { (key, _) -> key.sequence }
                .map { it.value }
        }
    }

    fun orderedConditions(): List<LocationCondition> = locations.map { location ->
        conditions[location.id] ?: LocationCondition(
            locationId = location.id,
            locationName = location.name,
        )
    }

    fun invalidatePublishedReport() {
        generatedReport = null
    }

    fun storePhoto(target: PendingPhotoTarget, uri: Uri) {
        target.captureType?.let { type ->
            photos[PhotoSlotKey(target.location.id, type, target.sequence)] = CapturedPhoto(
                locationId = target.location.id,
                locationName = target.location.name,
                type = type,
                uri = uri,
                sequence = target.sequence,
            )
            WindowUploadScheduler.enqueueMock(
                context = context,
                locationId = target.location.id,
                category = type.name.lowercase(),
                uri = uri,
                sequence = target.sequence,
            )
        }
        target.evidenceType?.let { type ->
            evidencePhotos[EvidenceSlotKey(target.location.id, type, target.sequence)] = EvidencePhoto(
                locationId = target.location.id,
                locationName = target.location.name,
                type = type,
                uri = uri,
                sequence = target.sequence,
            )
            WindowUploadScheduler.enqueueMock(
                context = context,
                locationId = target.location.id,
                category = type.name.lowercase(),
                uri = uri,
                sequence = target.sequence,
            )
        }
        invalidatePublishedReport()
    }

    fun clearAllState(nextScreen: AppScreen = AppScreen.START) {
        setup = InspectionSetup()
        locations = emptyList()
        photos.clear()
        evidencePhotos.clear()
        conditions.clear()
        currentLocationIndex = 0
        currentCaptureIndex = 0
        currentSymptomIndex = 0
        pendingPhotoTarget = null
        pendingCameraUri = null
        analysisProgress = 0f
        result = null
        staffReview = StaffReview()
        generatedReport = null
        quoteAttachment = null
        isGeneratingReport = false
        hasSavedDraft = false
        scope.launch(Dispatchers.IO) { draftDao.clear() }
        screen = nextScreen
    }

    fun navigateBack() {
        screen = when (screen) {
            AppScreen.START -> AppScreen.START
            AppScreen.HISTORY -> AppScreen.START
            AppScreen.SETUP -> AppScreen.START
            AppScreen.LOCATIONS -> AppScreen.SETUP
            AppScreen.GUIDE -> AppScreen.LOCATIONS
            AppScreen.CAPTURE -> {
                when {
                    currentCaptureIndex > 0 -> {
                        currentCaptureIndex -= 1
                        AppScreen.CAPTURE
                    }
                    currentLocationIndex > 0 -> {
                        currentLocationIndex -= 1
                        AppScreen.EVIDENCE
                    }
                    else -> AppScreen.GUIDE
                }
            }
            AppScreen.EVIDENCE -> {
                currentCaptureIndex = CaptureType.entries.lastIndex
                AppScreen.CAPTURE
            }
            AppScreen.ANALYZING -> {
                currentLocationIndex = locations.lastIndex.coerceAtLeast(0)
                AppScreen.EVIDENCE
            }
            AppScreen.RESULT -> {
                currentLocationIndex = locations.lastIndex.coerceAtLeast(0)
                AppScreen.EVIDENCE
            }
            AppScreen.DETAIL -> AppScreen.RESULT
            AppScreen.SYMPTOMS -> {
                if (currentSymptomIndex > 0) {
                    currentSymptomIndex -= 1
                    AppScreen.SYMPTOMS
                } else {
                    AppScreen.DETAIL
                }
            }
            AppScreen.STAFF_REVIEW -> {
                currentSymptomIndex = locations.lastIndex.coerceAtLeast(0)
                AppScreen.SYMPTOMS
            }
            AppScreen.CUSTOMER_REPORT -> AppScreen.STAFF_REVIEW
            AppScreen.SOLUTION -> AppScreen.CUSTOMER_REPORT
        }
    }

    fun beginLocationSymptoms() {
        currentSymptomIndex = 0
        locations.forEach { location ->
            if (conditions[location.id] == null) {
                conditions[location.id] = LocationCondition(
                    locationId = location.id,
                    locationName = location.name,
                )
            }
        }
        screen = AppScreen.SYMPTOMS
    }

    LaunchedEffect(Unit) {
        val savedDraft = withContext(Dispatchers.IO) { draftDao.get() }
        if (savedDraft != null) {
            runCatching { InspectionDraftCodec.decode(savedDraft.payloadJson) }
                .onSuccess { snapshot ->
                    setup = snapshot.setup
                    locations = snapshot.locations
                    photos.clear()
                    snapshot.photos.forEach { photo ->
                        photos[PhotoSlotKey(photo.locationId, photo.type, photo.sequence)] = photo
                    }
                    evidencePhotos.clear()
                    snapshot.evidencePhotos.forEach { photo ->
                        evidencePhotos[EvidenceSlotKey(photo.locationId, photo.type, photo.sequence)] = photo
                    }
                    conditions.clear()
                    snapshot.conditions.forEach { condition -> conditions[condition.locationId] = condition }
                    staffReview = snapshot.review
                    hasSavedDraft = snapshot.locations.isNotEmpty() ||
                        snapshot.setup.customer.name.isNotBlank() ||
                        snapshot.photos.isNotEmpty() ||
                        snapshot.evidencePhotos.isNotEmpty()
                }
                .onFailure {
                    withContext(Dispatchers.IO) { draftDao.clear() }
                }
        }
        draftLoaded = true
    }

    val photoDraftSnapshot = photos.values.toList()
    val evidenceDraftSnapshot = evidencePhotos.values.toList()
    val conditionDraftSnapshot = conditions.values.toList()
    LaunchedEffect(
        draftLoaded,
        setup,
        locations,
        photoDraftSnapshot,
        evidenceDraftSnapshot,
        conditionDraftSnapshot,
        staffReview,
    ) {
        if (!draftLoaded) return@LaunchedEffect
        val meaningful = locations.isNotEmpty() ||
            setup.customer.name.isNotBlank() ||
            setup.customer.address.isNotBlank() ||
            photoDraftSnapshot.isNotEmpty() ||
            evidenceDraftSnapshot.isNotEmpty()
        if (!meaningful) {
            hasSavedDraft = false
            return@LaunchedEffect
        }
        delay(350)
        val payload = InspectionDraftCodec.encode(
            InspectionDraftSnapshot(
                setup = setup,
                locations = locations,
                photos = photoDraftSnapshot,
                evidencePhotos = evidenceDraftSnapshot,
                conditions = conditionDraftSnapshot,
                review = staffReview,
            ),
        )
        withContext(Dispatchers.IO) {
            draftDao.save(InspectionDraftEntity(payloadJson = payload))
        }
        hasSavedDraft = true
    }

    BackHandler(enabled = screen != AppScreen.START) {
        navigateBack()
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        val target = pendingPhotoTarget
        val uri = pendingCameraUri
        if (success && target != null && uri != null) {
            storePhoto(target, uri)
        } else if (!success) {
            Toast.makeText(context, "촬영이 취소되었습니다.", Toast.LENGTH_SHORT).show()
        }
        pendingPhotoTarget = null
        pendingCameraUri = null
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { sourceUri ->
        val target = pendingPhotoTarget
        pendingPhotoTarget = null
        if (sourceUri == null || target == null) return@rememberLauncherForActivityResult

        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) { context.copyImageToCache(sourceUri) }
            }.onSuccess { cachedUri ->
                storePhoto(target, cachedUri)
            }.onFailure {
                Toast.makeText(context, "선택한 사진을 불러오지 못했습니다.", Toast.LENGTH_LONG).show()
            }
        }
    }

    val quotePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
        quoteAttachment = QuoteAttachment(
            uri = uri,
            displayName = context.getDisplayName(uri) ?: "창호 견적서.pdf",
        )
    }

    fun launchCamera(target: PendingPhotoTarget) {
        val prefix = target.captureType?.shortLabel ?: target.evidenceType?.shortLabel ?: "photo"
        val uri = context.createCaptureUri(prefix)
        pendingPhotoTarget = target
        pendingCameraUri = uri
        try {
            cameraLauncher.launch(uri)
        } catch (_: ActivityNotFoundException) {
            pendingPhotoTarget = null
            pendingCameraUri = null
            Toast.makeText(context, "사용 가능한 카메라 앱이 없습니다.", Toast.LENGTH_LONG).show()
        }
    }

    fun launchGallery(target: PendingPhotoTarget) {
        pendingPhotoTarget = target
        try {
            galleryLauncher.launch("image/*")
        } catch (_: ActivityNotFoundException) {
            pendingPhotoTarget = null
            Toast.makeText(context, "사진을 선택할 앱이 없습니다.", Toast.LENGTH_LONG).show()
        }
    }

    LaunchedEffect(screen, photos.size, evidencePhotos.size, locations) {
        if (screen != AppScreen.ANALYZING || locations.isEmpty()) return@LaunchedEffect

        val expectedPhotoCount = locations.size * CaptureType.entries.size
        val basePhotoCount = photos.keys.count { it.sequence == 0 }
        if (basePhotoCount < expectedPhotoCount) {
            val missingLocationIndex = locations.indexOfFirst { location ->
                CaptureType.entries.any { type -> PhotoSlotKey(location.id, type, 0) !in photos }
            }.coerceAtLeast(0)
            val missingTypeIndex = CaptureType.entries.indexOfFirst { type ->
                PhotoSlotKey(locations[missingLocationIndex].id, type, 0) !in photos
            }.coerceAtLeast(0)
            currentLocationIndex = missingLocationIndex
            currentCaptureIndex = missingTypeIndex
            Toast.makeText(context, "필수 개별 창호 사진이 누락되었습니다.", Toast.LENGTH_LONG).show()
            screen = AppScreen.CAPTURE
            return@LaunchedEffect
        }

        analysisProgress = 0f
        runCatching {
            coroutineScope {
                val analysis = async {
                    repository.analyze(
                        photos = orderedPhotos(),
                        evidencePhotos = orderedEvidencePhotos(),
                    )
                }
                repeat(24) { step ->
                    delay(100)
                    analysisProgress = ((step + 1) / 24f).coerceAtMost(0.98f)
                }
                result = analysis.await().copy(aiMode = "mock")
            }
        }.onFailure {
            Toast.makeText(context, "Mock 분석 중 오류가 발생했습니다.", Toast.LENGTH_LONG).show()
            currentLocationIndex = locations.lastIndex.coerceAtLeast(0)
            screen = AppScreen.EVIDENCE
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
                hasDraft = hasSavedDraft,
                onStart = { clearAllState(AppScreen.SETUP) },
                onResume = {
                    screen = if (locations.isEmpty()) AppScreen.SETUP else AppScreen.GUIDE
                },
                onHistory = { screen = AppScreen.HISTORY },
            )

            AppScreen.HISTORY -> HistoryPlaceholderScreen(onBack = ::navigateBack)

            AppScreen.SETUP -> InspectionSetupScreen(
                setup = setup,
                onSetupChange = {
                    setup = it
                    invalidatePublishedReport()
                },
                onBack = ::navigateBack,
                onNext = { screen = AppScreen.LOCATIONS },
            )

            AppScreen.LOCATIONS -> SpaceUnitSetupScreen(
                locations = locations,
                onLocationsChange = { updated ->
                    val validIds = updated.mapTo(mutableSetOf()) { it.id }
                    photos.keys.filter { it.locationId !in validIds }.forEach(photos::remove)
                    evidencePhotos.keys.filter { it.locationId !in validIds }.forEach(evidencePhotos::remove)
                    conditions.keys.filter { it !in validIds }.forEach(conditions::remove)
                    locations = updated
                    updated.forEach { location ->
                        if (conditions[location.id] == null) {
                            conditions[location.id] = LocationCondition(
                                locationId = location.id,
                                locationName = location.name,
                            )
                        }
                    }
                    result = null
                    staffReview = StaffReview()
                    invalidatePublishedReport()
                },
                onBack = ::navigateBack,
                onNext = { screen = AppScreen.GUIDE },
            )

            AppScreen.GUIDE -> CaptureGuideScreen(
                locationCount = locations.size,
                onBack = ::navigateBack,
                onStartCapture = {
                    currentLocationIndex = 0
                    currentCaptureIndex = 0
                    result = null
                    staffReview = StaffReview()
                    invalidatePublishedReport()
                    screen = AppScreen.CAPTURE
                },
            )

            AppScreen.CAPTURE -> locations.getOrNull(currentLocationIndex)?.let { location ->
                val type = CaptureType.entries[currentCaptureIndex]
                val currentUri = photos[PhotoSlotKey(location.id, type, 0)]?.uri
                val capturedCount = CaptureType.entries.count { captureType ->
                    PhotoSlotKey(location.id, captureType, 0) in photos
                }
                CaptureScreen(
                    locationName = location.name,
                    currentLocationIndex = currentLocationIndex,
                    totalLocations = locations.size,
                    currentIndex = currentCaptureIndex,
                    capturedCount = capturedCount,
                    latestPhotoUri = currentUri,
                    onBack = ::navigateBack,
                    onCapture = {
                        launchCamera(PendingPhotoTarget(location = location, captureType = type, sequence = 0))
                    },
                    onGallery = {
                        launchGallery(PendingPhotoTarget(location = location, captureType = type, sequence = 0))
                    },
                    onNext = {
                        if (currentCaptureIndex < CaptureType.entries.lastIndex) {
                            currentCaptureIndex += 1
                        } else {
                            screen = AppScreen.EVIDENCE
                        }
                    },
                    nextLabel = if (currentCaptureIndex < CaptureType.entries.lastIndex) {
                        "다음 사진"
                    } else {
                        "결로·누수·기타 상세사진 추가"
                    },
                )
            }

            AppScreen.EVIDENCE -> locations.getOrNull(currentLocationIndex)?.let { location ->
                val selected = EvidenceType.entries.associateWith { type ->
                    evidencePhotos.entries
                        .filter { (key, _) -> key.locationId == location.id && key.type == type }
                        .sortedBy { (key, _) -> key.sequence }
                        .map { it.value.uri }
                }
                fun nextEvidenceSequence(type: EvidenceType): Int =
                    evidencePhotos.keys
                        .filter { key -> key.locationId == location.id && key.type == type }
                        .maxOfOrNull { it.sequence }
                        ?.plus(1)
                        ?: 0

                MultiEvidencePhotosScreen(
                    location = location,
                    selectedPhotos = selected,
                    onCamera = { type ->
                        launchCamera(
                            PendingPhotoTarget(
                                location = location,
                                evidenceType = type,
                                sequence = nextEvidenceSequence(type),
                            ),
                        )
                    },
                    onGallery = { type ->
                        launchGallery(
                            PendingPhotoTarget(
                                location = location,
                                evidenceType = type,
                                sequence = nextEvidenceSequence(type),
                            ),
                        )
                    },
                    onRemove = { type, index ->
                        val keys = evidencePhotos.keys
                            .filter { key -> key.locationId == location.id && key.type == type }
                            .sortedBy { it.sequence }
                        keys.getOrNull(index)?.let(evidencePhotos::remove)
                        invalidatePublishedReport()
                    },
                    onBack = ::navigateBack,
                    onNext = {
                        if (currentLocationIndex < locations.lastIndex) {
                            currentLocationIndex += 1
                            currentCaptureIndex = 0
                            screen = AppScreen.CAPTURE
                        } else {
                            screen = AppScreen.ANALYZING
                        }
                    },
                    nextLabel = if (currentLocationIndex < locations.lastIndex) {
                        "다음 개별 창호 촬영"
                    } else {
                        "전체 개별 창호 Mock 분석 시작"
                    },
                )
            }

            AppScreen.ANALYZING -> AnalysisScreen(progress = analysisProgress)

            AppScreen.RESULT -> result?.let { diagnosis ->
                EmployeeResultSummaryScreen(
                    result = diagnosis,
                    onBack = ::navigateBack,
                    onDetail = { screen = AppScreen.DETAIL },
                    onContinue = ::beginLocationSymptoms,
                )
            }

            AppScreen.DETAIL -> result?.let { diagnosis ->
                EmployeeDetailResultScreen(
                    result = diagnosis,
                    onBack = ::navigateBack,
                    onContinue = ::beginLocationSymptoms,
                )
            }

            AppScreen.SYMPTOMS -> locations.getOrNull(currentSymptomIndex)?.let { location ->
                val condition = conditions[location.id] ?: LocationCondition(
                    locationId = location.id,
                    locationName = location.name,
                )
                LocationSymptomsScreen(
                    location = location,
                    condition = condition,
                    onConditionChange = {
                        conditions[location.id] = it
                        invalidatePublishedReport()
                    },
                    onBack = ::navigateBack,
                    onNext = {
                        if (currentSymptomIndex < locations.lastIndex) {
                            currentSymptomIndex += 1
                        } else {
                            screen = AppScreen.STAFF_REVIEW
                        }
                    },
                    nextLabel = if (currentSymptomIndex < locations.lastIndex) {
                        "다음 개별 창호 증상 입력"
                    } else {
                        "직원 최종 검토"
                    },
                )
            }

            AppScreen.STAFF_REVIEW -> result?.let { diagnosis ->
                StaffReviewScreen(
                    setup = setup,
                    result = diagnosis,
                    review = staffReview,
                    onReviewChange = {
                        staffReview = it
                        invalidatePublishedReport()
                    },
                    onBack = ::navigateBack,
                    onPublish = { screen = AppScreen.CUSTOMER_REPORT },
                )
            }

            AppScreen.CUSTOMER_REPORT -> result?.let { diagnosis ->
                CustomerReportScreen(
                    setup = setup,
                    locations = locations,
                    result = diagnosis,
                    review = staffReview,
                    generatedReport = generatedReport,
                    quoteAttachment = quoteAttachment,
                    isGenerating = isGeneratingReport,
                    onBack = ::navigateBack,
                    onGenerateReport = {
                        if (!staffReview.confirmed) {
                            Toast.makeText(context, "직원 검토 완료 확인이 필요합니다.", Toast.LENGTH_LONG).show()
                        } else {
                            isGeneratingReport = true
                            scope.launch {
                                runCatching {
                                    withContext(Dispatchers.IO) {
                                        context.generateInspectionReportPdf(
                                            setup = setup,
                                            locations = locations,
                                            photos = orderedPhotos(),
                                            evidencePhotos = orderedEvidencePhotos(),
                                            result = diagnosis,
                                            conditions = orderedConditions(),
                                            review = staffReview,
                                        )
                                    }
                                }.onSuccess {
                                    generatedReport = it
                                    Toast.makeText(context, "고객용 PDF 리포트를 생성했습니다.", Toast.LENGTH_SHORT).show()
                                }.onFailure {
                                    Toast.makeText(
                                        context,
                                        "PDF 생성 중 오류가 발생했습니다: ${it.message.orEmpty()}",
                                        Toast.LENGTH_LONG,
                                    ).show()
                                }
                                isGeneratingReport = false
                            }
                        }
                    },
                    onPickQuote = {
                        quotePickerLauncher.launch(arrayOf("application/pdf"))
                    },
                    onRemoveQuote = { quoteAttachment = null },
                    onShare = {
                        val reportFile = generatedReport
                        if (reportFile == null) {
                            Toast.makeText(context, "먼저 PDF 리포트를 생성해 주세요.", Toast.LENGTH_SHORT).show()
                        } else {
                            runCatching {
                                context.shareInspectionReport(
                                    report = reportFile,
                                    quoteAttachment = quoteAttachment,
                                    customerName = setup.customer.name,
                                )
                            }.onFailure {
                                Toast.makeText(context, "공유할 앱을 열지 못했습니다.", Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                    onSolution = { screen = AppScreen.SOLUTION },
                )
            }

            AppScreen.SOLUTION -> SolutionScreen(
                onBack = ::navigateBack,
                onVisit = { screen = AppScreen.CUSTOMER_REPORT },
            )
        }
    }
}
