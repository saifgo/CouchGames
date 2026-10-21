package app.couch.tv

import android.app.Activity
import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * What Couch Free allows. Everything else needs Couch Pro (ADR-005).
 * Limits are on how far you can go, never on how well it plays: no time limits,
 * no ads, no added lag.
 */
object ProRules {
    const val FREE_PLAYERS = 2
    /** Seats with Couch Pro (the host maximum). */
    const val PRO_PLAYERS = 8
    const val FREE_SAVE_SLOTS = 1
    /** 8- and 16-bit consoles. GBA, PS1, N64, PSP, NDS and PS2 are Pro. */
    val FREE_SYSTEMS = setOf("nes", "snes", "genesis", "gb", "gbc", "atari2600", "pce")
    /** The "Go Pro" card before a game shows at most this often. */
    const val NAG_INTERVAL_MS = 20L * 60 * 60 * 1000

    fun players(pro: Boolean, chosen: Int) = if (pro) chosen else minOf(chosen, FREE_PLAYERS)
    fun systemAllowed(pro: Boolean, system: String) = pro || system in FREE_SYSTEMS
    fun saveSlotAllowed(pro: Boolean, slot: Int) = pro || slot < FREE_SAVE_SLOTS
    fun remoteLibrary(pro: Boolean) = pro
    fun shouldNag(pro: Boolean, lastNagMs: Long, nowMs: Long) = !pro && nowMs - lastNagMs >= NAG_INTERVAL_MS
}

/**
 * Couch Pro: a one-time Google Play purchase ([PRODUCT_ID]). The answer is cached so Pro
 * keeps working offline, and re-checked with Play on every start (refunds turn it off).
 * Debug builds also get a test switch in Settings.
 */
class Pro(private val context: Context, private val settings: Settings) : PurchasesUpdatedListener {
    companion object {
        /** In-app product id. Create it in Play Console → Monetize → In-app products. */
        const val PRODUCT_ID = "couch_pro"
    }

    val debuggable = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

    private val _active = MutableStateFlow(settings.proOwned || (debuggable && settings.proDebug))
    val active: StateFlow<Boolean> = _active
    val isPro get() = _active.value

    /** Store price ("$5.99"), null until Play answers. */
    private val _price = MutableStateFlow<String?>(null)
    val price: StateFlow<String?> = _price

    /** Why buying isn't possible right now, or a pending-payment note. Null when all is fine. */
    private val _status = MutableStateFlow<String?>(null)
    val status: StateFlow<String?> = _status

    private var details: ProductDetails? = null
    private var ready = false

    private val client = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    fun start() {
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                ready = result.responseCode == BillingClient.BillingResponseCode.OK
                if (ready) refresh() else unavailable(result)
            }

            override fun onBillingServiceDisconnected() {
                ready = false
            }
        })
    }

    /** Re-checks what this Google account owns ("Restore purchase") and the price. */
    fun refresh() {
        if (!ready) return start()
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()) { r, list ->
            if (r.responseCode == BillingClient.BillingResponseCode.OK) handle(list, complete = true)
        }
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT_ID)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()) { r, result ->
            details = result.productDetailsList.firstOrNull()
            _price.value = details?.oneTimePurchaseOfferDetails?.formattedPrice
            if (r.responseCode == BillingClient.BillingResponseCode.OK && details == null) {
                _status.value = "Couch Pro isn't on sale in this store yet."
            }
        }
    }

    /** Opens the Google Play purchase sheet. */
    fun buy(activity: Activity) {
        val d = details
        if (!ready || d == null) {
            if (_status.value == null) _status.value = "Google Play isn't reachable. Couch Pro is sold through Google Play on this TV."
            return refresh()
        }
        val params = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build()
        client.launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(params)).build())
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> handle(purchases.orEmpty(), complete = false)
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> refresh()
            BillingClient.BillingResponseCode.USER_CANCELED -> Unit
            else -> _status.value = "Purchase didn't go through (${result.debugMessage.ifBlank { "code ${result.responseCode}" }})."
        }
    }

    /** Debug builds only: turn Pro on/off without a purchase. */
    fun setDebug(on: Boolean) {
        if (!debuggable) return
        settings.proDebug = on
        _active.value = settings.proOwned || on
    }

    /** [complete]: this is everything the account owns, so a missing purchase means refunded. */
    private fun handle(purchases: List<Purchase>, complete: Boolean) {
        val ours = purchases.filter { PRODUCT_ID in it.products }
        val owned = ours.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
        // Play refunds purchases that aren't acknowledged within 3 days.
        owned.filter { !it.isAcknowledged }.forEach { p ->
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build()) { r ->
                if (r.responseCode != BillingClient.BillingResponseCode.OK) Log.w("Couch", "acknowledge failed: ${r.debugMessage}")
            }
        }
        _status.value = if (owned.isEmpty() && ours.any { it.purchaseState == Purchase.PurchaseState.PENDING }) {
            "Payment pending. Pro turns on as soon as Google Play confirms it."
        } else null
        if (owned.isNotEmpty() || complete) {
            settings.proOwned = owned.isNotEmpty()
            _active.value = settings.proOwned || (debuggable && settings.proDebug)
        }
    }

    private fun unavailable(result: BillingResult) {
        Log.i("Couch", "billing unavailable: ${result.responseCode} ${result.debugMessage}")
        _status.value = "Google Play isn't available on this device. Couch Pro is sold through Google Play."
    }
}
