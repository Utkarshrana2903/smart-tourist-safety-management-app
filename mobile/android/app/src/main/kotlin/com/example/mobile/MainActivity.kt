package com.example.mobile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    companion object {
        private const val SMS_CHANNEL = "modoner/sms"
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            SMS_CHANNEL
        ).setMethodCallHandler { call, result ->

            if (call.method != "openSmsDraft") {
                result.notImplemented()
                return@setMethodCallHandler
            }

            val phoneNumber = call.argument<String>("phoneNumber")?.trim()
            val message = call.argument<String>("message")

            when {
                phoneNumber.isNullOrBlank() -> {
                    result.error(
                        "INVALID_NUMBER",
                        "A destination phone number is required.",
                        null
                    )
                }

                message.isNullOrBlank() -> {
                    result.error(
                        "INVALID_MESSAGE",
                        "The SMS message cannot be empty.",
                        null
                    )
                }

                else -> openSmsDraft(phoneNumber, message, result)
            }
        }
    }

    private fun openSmsDraft(
        phoneNumber: String,
        message: String,
        result: MethodChannel.Result
    ) {
        try {
            val intent = Intent(Intent.ACTION_SENDTO).apply {
                data = Uri.fromParts("smsto", phoneNumber, null)
                putExtra("sms_body", message)
            }

            startActivity(intent)

            result.success(
                mapOf(
                    "status" to "draft_opened",
                    "details" to
                        "SMS composer opened. MoDoNER did not send the message. " +
                        "User action and delivery are unconfirmed."
                )
            )
        } catch (error: ActivityNotFoundException) {
            result.error(
                "SMS_COMPOSER_UNAVAILABLE",
                "No compatible messaging app is available on this device.",
                null
            )
        } catch (error: Exception) {
            result.error(
                "SMS_DRAFT_FAILED",
                error.message ?: "Android could not open the SMS draft.",
                null
            )
        }
    }
}