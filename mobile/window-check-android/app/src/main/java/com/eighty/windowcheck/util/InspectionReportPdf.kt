package com.eighty.windowcheck.util

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.core.content.FileProvider
import com.eighty.windowcheck.model.CapturedPhoto
import com.eighty.windowcheck.model.DiagnosisResult
import com.eighty.windowcheck.model.EvidencePhoto
import com.eighty.windowcheck.model.InspectionSetup
import com.eighty.windowcheck.model.LocationCondition
import com.eighty.windowcheck.model.QuoteAttachment
import com.eighty.windowcheck.model.StaffReview
import com.eighty.windowcheck.model.WindowLocation
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val PAGE_WIDTH = 595
private const val PAGE_HEIGHT = 842
private const val PAGE_MARGIN = 38f


data class GeneratedInspectionReport(
    val uri: Uri,
    val fileName: String,
    val reportNumber: String,
)

fun Context.generateInspectionReportPdf(
    setup: InspectionSetup,
    locations: List<WindowLocation>,
    photos: List<CapturedPhoto>,
    evidencePhotos: List<EvidencePhoto>,
    result: DiagnosisResult,
    conditions: List<LocationCondition>,
    review: StaffReview,
): GeneratedInspectionReport {
    require(review.confirmed) { "직원 검토 완료 후 리포트를 발행할 수 있습니다." }
    require(locations.isNotEmpty()) { "점검 위치가 필요합니다." }

    val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.KOREA).format(Date())
    val reportNumber = "EWC-${SimpleDateFormat("yyyyMMdd-HHmm", Locale.KOREA).format(Date())}"
    val safeCustomerName = setup.customer.name.ifBlank { "고객" }.replace(Regex("[^가-힣a-zA-Z0-9_-]"), "_")
    val fileName = "에잇티_창호점검리포트_${safeCustomerName}_$timestamp.pdf"
    val directory = File(cacheDir, "window-check/reports").apply { mkdirs() }
    val outputFile = File(directory, fileName)

    val document = PdfDocument()
    var pageNumber = 0

    fun newPage(): PdfDocument.Page {
        pageNumber += 1
        return document.startPage(
            PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create(),
        )
    }

    runCatching {
        val cover = newPage()
        drawCoverPage(
            canvas = cover.canvas,
            setup = setup,
            result = result,
            review = review,
            locations = locations,
            reportNumber = reportNumber,
            pageNumber = pageNumber,
        )
        document.finishPage(cover)

        locations.forEach { location ->
            val locationResult = result.locations.firstOrNull { it.locationId == location.id }
            val condition = conditions.firstOrNull { it.locationId == location.id }

            val diagnosisPage = newPage()
            drawLocationDiagnosisPage(
                canvas = diagnosisPage.canvas,
                location = location,
                locationResult = locationResult,
                condition = condition,
                review = review,
                reportNumber = reportNumber,
                pageNumber = pageNumber,
            )
            document.finishPage(diagnosisPage)

            val locationPhotos = photos
                .filter { it.locationId == location.id }
                .sortedBy { it.type.ordinal }
            val locationEvidence = evidencePhotos
                .filter { it.locationId == location.id }
                .sortedBy { it.type.ordinal }

            val photoPage = newPage()
            drawLocationPhotoPage(
                context = this,
                canvas = photoPage.canvas,
                location = location,
                photos = locationPhotos,
                evidencePhotos = locationEvidence,
                reportNumber = reportNumber,
                pageNumber = pageNumber,
            )
            document.finishPage(photoPage)
        }

        outputFile.outputStream().use(document::writeTo)
    }.onFailure {
        outputFile.delete()
        throw it
    }
    document.close()

    val uri = FileProvider.getUriForFile(
        this,
        "$packageName.fileprovider",
        outputFile,
    )
    return GeneratedInspectionReport(
        uri = uri,
        fileName = fileName,
        reportNumber = reportNumber,
    )
}

fun Context.shareInspectionReport(
    report: GeneratedInspectionReport,
    quoteAttachment: QuoteAttachment?,
    customerName: String,
) {
    val uris = arrayListOf(report.uri).apply {
        quoteAttachment?.let { add(it.uri) }
    }
    val clip = ClipData.newUri(contentResolver, "창호 점검 리포트", uris.first())
    uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }

    val message = buildString {
        append("안녕하세요. 에잇티 창호 점검 리포트를 보내드립니다.")
        if (quoteAttachment != null) append(" 점검 결과와 함께 견적서를 첨부했습니다.")
        append("\n리포트 번호: ${report.reportNumber}")
        append("\n본 자료는 사진 및 현장 확인을 바탕으로 한 점검 의견이며, 공사 범위는 실측 후 확정됩니다.")
    }

    val sendIntent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        type = "application/pdf"
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        putExtra(Intent.EXTRA_SUBJECT, "${customerName.ifBlank { "고객" }}님 창호 점검 리포트")
        putExtra(Intent.EXTRA_TEXT, message)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = clip
        if (this@shareInspectionReport !is Activity) {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
    startActivity(Intent.createChooser(sendIntent, "고객에게 리포트 보내기"))
}

private fun drawCoverPage(
    canvas: Canvas,
    setup: InspectionSetup,
    result: DiagnosisResult,
    review: StaffReview,
    locations: List<WindowLocation>,
    reportNumber: String,
    pageNumber: Int,
) {
    canvas.drawColor(Color.WHITE)
    val navy = Color.rgb(11, 39, 82)
    val blue = Color.rgb(14, 81, 196)
    val lightBlue = Color.rgb(234, 242, 255)
    val muted = Color.rgb(92, 106, 128)

    val brandPaint = textPaint(16f, navy, true)
    canvas.drawText("EIGHTY  WINDOW CHECK", PAGE_MARGIN, 58f, brandPaint)
    val sloganPaint = textPaint(9.5f, muted, false)
    canvas.drawText("보이는 디자인, 보이지 않는 기준.", PAGE_MARGIN, 78f, sloganPaint)

    val titlePaint = textPaint(30f, navy, true)
    canvas.drawText("창호 점검 리포트", PAGE_MARGIN, 150f, titlePaint)
    val subtitlePaint = textPaint(12f, muted, false)
    canvas.drawText("직원 현장점검 · 위치별 사진 · AI 예비분석", PAGE_MARGIN, 178f, subtitlePaint)

    val gradeRect = RectF(PAGE_MARGIN, 218f, PAGE_MARGIN + 92f, 310f)
    val gradePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = blue }
    canvas.drawRoundRect(gradeRect, 18f, 18f, gradePaint)
    val gradePaintText = textPaint(40f, Color.WHITE, true)
    drawCenteredText(canvas, result.grade, gradeRect, gradePaintText)

    val gradeTitlePaint = textPaint(18f, navy, true)
    canvas.drawText(result.gradeTitle, PAGE_MARGIN + 118f, 250f, gradeTitlePaint)
    val gradeSummaryPaint = textPaint(10.5f, muted, false)
    drawTextBlock(
        canvas = canvas,
        text = result.summary,
        x = PAGE_MARGIN + 118f,
        startY = 275f,
        maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - 118f,
        paint = gradeSummaryPaint,
        maxLines = 4,
    )

    val infoTop = 350f
    val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = lightBlue }
    canvas.drawRoundRect(
        RectF(PAGE_MARGIN, infoTop, PAGE_WIDTH - PAGE_MARGIN, 585f),
        18f,
        18f,
        cardPaint,
    )
    val sectionPaint = textPaint(12f, navy, true)
    canvas.drawText("점검 기본정보", PAGE_MARGIN + 18f, infoTop + 32f, sectionPaint)

    val labelPaint = textPaint(9.5f, muted, true)
    val valuePaint = textPaint(10.5f, navy, false)
    var y = infoTop + 64f
    y = drawLabelValue(canvas, "고객명", setup.customer.name.ifBlank { "미입력" }, y, labelPaint, valuePaint)
    y = drawLabelValue(canvas, "연락처", setup.customer.phone.ifBlank { "미입력" }, y, labelPaint, valuePaint)
    y = drawLabelValue(
        canvas,
        "주소",
        listOf(setup.customer.address, setup.customer.detailAddress).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "미입력" },
        y,
        labelPaint,
        valuePaint,
    )
    y = drawLabelValue(canvas, "점검 위치", locations.joinToString(", ") { it.name }, y, labelPaint, valuePaint)
    y = drawLabelValue(canvas, "점검 담당", listOf(setup.inspector.name, setup.inspector.teamPosition).filter { it.isNotBlank() }.joinToString(" · "), y, labelPaint, valuePaint)
    drawLabelValue(canvas, "리포트 번호", reportNumber, y, labelPaint, valuePaint)

    val commentPaint = textPaint(11f, navy, true)
    canvas.drawText("직원 최종 의견", PAGE_MARGIN, 635f, commentPaint)
    val commentBodyPaint = textPaint(10f, muted, false)
    drawTextBlock(
        canvas = canvas,
        text = review.customerComment.ifBlank { "위치별 점검 결과와 권장 조치를 확인해 주세요." },
        x = PAGE_MARGIN,
        startY = 660f,
        maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2,
        paint = commentBodyPaint,
        maxLines = 5,
    )

    drawDisclaimer(canvas, reportNumber, pageNumber)
}

private fun drawLocationDiagnosisPage(
    canvas: Canvas,
    location: WindowLocation,
    locationResult: com.eighty.windowcheck.model.LocationDiagnosisResult?,
    condition: LocationCondition?,
    review: StaffReview,
    reportNumber: String,
    pageNumber: Int,
) {
    canvas.drawColor(Color.WHITE)
    val navy = Color.rgb(11, 39, 82)
    val blue = Color.rgb(14, 81, 196)
    val muted = Color.rgb(92, 106, 128)
    val light = Color.rgb(244, 247, 252)

    canvas.drawText("위치별 점검 결과", PAGE_MARGIN, 54f, textPaint(11f, blue, true))
    canvas.drawText(location.name, PAGE_MARGIN, 94f, textPaint(26f, navy, true))
    if (location.note.isNotBlank()) {
        canvas.drawText(location.note, PAGE_MARGIN, 117f, textPaint(9.5f, muted, false))
    }

    val gradeRect = RectF(PAGE_WIDTH - PAGE_MARGIN - 62f, 46f, PAGE_WIDTH - PAGE_MARGIN, 108f)
    canvas.drawRoundRect(gradeRect, 16f, 16f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = blue })
    drawCenteredText(
        canvas,
        locationResult?.grade ?: "-",
        gradeRect,
        textPaint(27f, Color.WHITE, true),
    )

    var y = 150f
    canvas.drawRoundRect(
        RectF(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y + 104f),
        15f,
        15f,
        Paint(Paint.ANTI_ALIAS_FLAG).apply { color = light },
    )
    canvas.drawText(locationResult?.gradeTitle ?: "점검 결과 준비 중", PAGE_MARGIN + 16f, y + 30f, textPaint(13f, navy, true))
    drawTextBlock(
        canvas = canvas,
        text = locationResult?.summary ?: "해당 위치의 사진과 증상 정보를 확인합니다.",
        x = PAGE_MARGIN + 16f,
        startY = y + 54f,
        maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - 32f,
        paint = textPaint(9.5f, muted, false),
        maxLines = 4,
    )

    y += 132f
    canvas.drawText("직원 입력 증상", PAGE_MARGIN, y, textPaint(12f, navy, true))
    y += 22f
    val conditionText = if (condition == null) {
        "증상 입력 없음"
    } else {
        listOf(
            "사용연수 ${condition.yearsInUse}",
            "외풍 ${condition.draftLevel}",
            "결로 ${condition.condensation}${if (condition.condensationArea != "해당 없음") " · ${condition.condensationArea}" else ""}",
            "외부누수 ${condition.exteriorLeak}${if (condition.leakArea != "해당 없음") " · ${condition.leakArea}" else ""}",
            "개폐 ${condition.openingCondition}",
            "소음 ${condition.noiseLevel}",
            "곰팡이 ${condition.moldCondition}",
        ).joinToString("  |  ")
    }
    y = drawTextBlock(
        canvas = canvas,
        text = conditionText,
        x = PAGE_MARGIN,
        startY = y,
        maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2,
        paint = textPaint(9f, muted, false),
        maxLines = 4,
    ) + 18f

    canvas.drawText("항목별 점검", PAGE_MARGIN, y, textPaint(12f, navy, true))
    y += 20f
    val findings = locationResult?.findings.orEmpty()
    findings.forEach { finding ->
        if (y > 735f) return@forEach
        val statusColor = when (finding.level) {
            com.eighty.windowcheck.model.FindingLevel.GOOD -> Color.rgb(30, 150, 91)
            com.eighty.windowcheck.model.FindingLevel.CHECK -> blue
            com.eighty.windowcheck.model.FindingLevel.CAUTION -> Color.rgb(219, 137, 0)
            com.eighty.windowcheck.model.FindingLevel.POOR -> Color.rgb(211, 55, 69)
        }
        canvas.drawCircle(PAGE_MARGIN + 4f, y - 4f, 4f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = statusColor })
        canvas.drawText(
            "${finding.title} · ${finding.level.label}",
            PAGE_MARGIN + 16f,
            y,
            textPaint(9.5f, navy, true),
        )
        y = drawTextBlock(
            canvas = canvas,
            text = "${finding.summary} 권장: ${finding.recommendation}",
            x = PAGE_MARGIN + 16f,
            startY = y + 15f,
            maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - 16f,
            paint = textPaint(8.3f, muted, false),
            maxLines = 3,
        ) + 10f
    }

    if (condition?.otherIssue?.isNotBlank() == true && y < 750f) {
        canvas.drawText("기타 메모", PAGE_MARGIN, y, textPaint(10f, navy, true))
        drawTextBlock(
            canvas = canvas,
            text = condition.otherIssue,
            x = PAGE_MARGIN,
            startY = y + 18f,
            maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2,
            paint = textPaint(8.8f, muted, false),
            maxLines = 3,
        )
    }

    drawDisclaimer(canvas, reportNumber, pageNumber, review.recommendation)
}

private fun drawLocationPhotoPage(
    context: Context,
    canvas: Canvas,
    location: WindowLocation,
    photos: List<CapturedPhoto>,
    evidencePhotos: List<EvidencePhoto>,
    reportNumber: String,
    pageNumber: Int,
) {
    canvas.drawColor(Color.WHITE)
    val navy = Color.rgb(11, 39, 82)
    val blue = Color.rgb(14, 81, 196)
    val muted = Color.rgb(92, 106, 128)
    val border = Color.rgb(218, 226, 239)

    canvas.drawText("위치별 점검 사진", PAGE_MARGIN, 54f, textPaint(11f, blue, true))
    canvas.drawText(location.name, PAGE_MARGIN, 88f, textPaint(23f, navy, true))
    canvas.drawText("표준 사진과 결로·외부누수·기타 증상 사진", PAGE_MARGIN, 110f, textPaint(9.5f, muted, false))

    val items = buildList {
        photos.forEach { add(it.type.title to it.uri) }
        evidencePhotos.forEach { add(it.type.title to it.uri) }
    }.take(8)

    val left = PAGE_MARGIN
    val top = 138f
    val gapX = 14f
    val gapY = 14f
    val cellWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - gapX) / 2f
    val cellHeight = 155f

    if (items.isEmpty()) {
        canvas.drawText("등록된 사진이 없습니다.", PAGE_MARGIN, 180f, textPaint(11f, muted, false))
    } else {
        items.forEachIndexed { index, (label, uri) ->
            val column = index % 2
            val row = index / 2
            val x = left + column * (cellWidth + gapX)
            val y = top + row * (cellHeight + gapY)
            val rect = RectF(x, y, x + cellWidth, y + cellHeight)
            canvas.drawRoundRect(
                rect,
                10f,
                10f,
                Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.STROKE
                    strokeWidth = 1f
                    color = border
                },
            )
            canvas.drawText(label, x + 10f, y + 19f, textPaint(8.8f, navy, true))
            val imageRect = RectF(x + 8f, y + 28f, x + cellWidth - 8f, y + cellHeight - 8f)
            val bitmap = decodeSampledBitmap(context, uri, 1000)
            if (bitmap == null) {
                canvas.drawText("사진을 불러오지 못했습니다.", x + 12f, y + 88f, textPaint(8f, muted, false))
            } else {
                drawBitmapCenterCrop(canvas, bitmap, imageRect)
                bitmap.recycle()
            }
        }
    }

    drawDisclaimer(canvas, reportNumber, pageNumber)
}

private fun drawDisclaimer(
    canvas: Canvas,
    reportNumber: String,
    pageNumber: Int,
    recommendation: String? = null,
) {
    val muted = Color.rgb(105, 116, 134)
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(224, 230, 240)
        strokeWidth = 1f
    }
    canvas.drawLine(PAGE_MARGIN, 790f, PAGE_WIDTH - PAGE_MARGIN, 790f, linePaint)
    val footer = buildString {
        append("본 리포트는 사진 기반 AI 예비분석과 직원 확인을 종합한 점검 의견입니다. 정확한 원인과 공사 범위는 현장 실측 후 확정됩니다.")
        if (!recommendation.isNullOrBlank()) append(" 권장: $recommendation")
    }
    drawTextBlock(
        canvas = canvas,
        text = footer,
        x = PAGE_MARGIN,
        startY = 807f,
        maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - 90f,
        paint = textPaint(6.8f, muted, false),
        maxLines = 3,
    )
    canvas.drawText("$reportNumber  ·  $pageNumber", PAGE_WIDTH - PAGE_MARGIN - 88f, 822f, textPaint(7f, muted, true))
}

private fun drawLabelValue(
    canvas: Canvas,
    label: String,
    value: String,
    y: Float,
    labelPaint: Paint,
    valuePaint: Paint,
): Float {
    canvas.drawText(label, PAGE_MARGIN + 18f, y, labelPaint)
    val next = drawTextBlock(
        canvas = canvas,
        text = value,
        x = PAGE_MARGIN + 98f,
        startY = y,
        maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - 118f,
        paint = valuePaint,
        maxLines = 2,
    )
    return maxOf(y + 28f, next + 8f)
}

private fun textPaint(size: Float, color: Int, bold: Boolean): Paint {
    return Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        this.color = color
        typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
    }
}

private fun drawCenteredText(canvas: Canvas, text: String, rect: RectF, paint: Paint) {
    val x = rect.centerX() - paint.measureText(text) / 2f
    val y = rect.centerY() - (paint.ascent() + paint.descent()) / 2f
    canvas.drawText(text, x, y, paint)
}

private fun drawTextBlock(
    canvas: Canvas,
    text: String,
    x: Float,
    startY: Float,
    maxWidth: Float,
    paint: Paint,
    maxLines: Int = Int.MAX_VALUE,
): Float {
    var y = startY
    var lines = 0
    val lineHeight = (paint.descent() - paint.ascent()) + 3f

    text.split('\n').forEach { paragraph ->
        var remaining = paragraph.trim()
        if (remaining.isEmpty()) {
            y += lineHeight
            lines += 1
            return@forEach
        }
        while (remaining.isNotEmpty() && lines < maxLines) {
            var count = paint.breakText(remaining, true, maxWidth, null).coerceAtLeast(1)
            if (count < remaining.length) {
                val breakAt = remaining.lastIndexOf(' ', startIndex = count - 1)
                if (breakAt > 0) count = breakAt + 1
            }
            val line = remaining.take(count).trim()
            canvas.drawText(line, x, y, paint)
            remaining = remaining.drop(count).trimStart()
            y += lineHeight
            lines += 1
        }
    }
    return y
}

private fun decodeSampledBitmap(context: Context, uri: Uri, maxDimension: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sampleSize = 1
    while (bounds.outWidth / sampleSize > maxDimension || bounds.outHeight / sampleSize > maxDimension) {
        sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    return context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
}

private fun drawBitmapCenterCrop(canvas: Canvas, bitmap: Bitmap, destination: RectF) {
    val sourceRatio = bitmap.width.toFloat() / bitmap.height.toFloat()
    val destinationRatio = destination.width() / destination.height()
    val source = if (sourceRatio > destinationRatio) {
        val targetWidth = (bitmap.height * destinationRatio).toInt()
        val left = (bitmap.width - targetWidth) / 2
        Rect(left, 0, left + targetWidth, bitmap.height)
    } else {
        val targetHeight = (bitmap.width / destinationRatio).toInt()
        val top = (bitmap.height - targetHeight) / 2
        Rect(0, top, bitmap.width, top + targetHeight)
    }
    canvas.drawBitmap(bitmap, source, destination, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
}
