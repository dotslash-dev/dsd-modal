/**
 * モーダル初期化
 *
 * 対応機能:
 * - 通常モーダルの開閉
 * - 背景クリックでのクローズ
 * - data-modal-group を用いたグループモーダルの前後移動
 * - 前後移動ボタンの自動生成
 * - 連打時に破綻しにくいアニメーション完了制御
 *
 * 前提:
 * - トリガー要素に .js-modal-trigger を付与する
 * - 開きたいモーダルIDを data-href に指定する
 * - グループ化したい場合は data-modal-group を付与する
 *
 * 例:
 * <button
 *   type="button"
 *   class="js-modal-trigger"
 *   data-href="modal-id"
 *   data-modal-group="group-a">
 *   open
 * </button>
 */
function modal() {
  /**
   * DOM参照用クラス
   * 既存HTML上の要素を取得するために使用する。
   */
  const SELECTORS = {
    trigger: "js-modal-trigger",
    close: "js-modal-close",
    inner: "modal-inner",
    bg: "modal-bg",
    nav: "modal-nav",
    prev: "modal-nav--prev",
    next: "modal-nav--next",
  };

  /**
   * 状態管理用クラス
   * JSで付け外しし、表示状態や進行状態を表現する。
   */
  const STATE_CLASSES = {
    active: "is-modal-active",
    closing: "is-modal-closing",
    bodyOpen: "is-modal-open",
    keepBg: "is-bg-kept",
  };

  /**
   * アニメーション方向制御用クラス
   * グループモーダル切替時の見た目に使用する。
   */
  const ANIMATION_CLASSES = {
    openFromLeft: "is-modal-active-from-left",
    openFromRight: "is-modal-active-from-right",
    closeToLeft: "is-modal-closing-to-left",
    closeToRight: "is-modal-closing-to-right",
  };

  /**
   * data属性定義
   */
  const DATA_ATTRS = {
    group: "data-modal-group",
  };

  /**
   * 現在表示中のモーダル情報を管理する状態。
   *
   * modalId:
   *   現在表示中のモーダルID
   * groupName:
   *   現在表示中モーダルが属しているグループ名
   */
  let currentModalState = {
    modalId: null,
    groupName: null,
  };

  /**
   * グループモーダル切替中かどうかを表すフラグ。
   *
   * prev / next の高速連打で close → open が多重実行されるのを防ぐために使う。
   */
  let isGroupTransitioning = false;

  /**
   * 指定グループに属するトリガー要素一覧を返す。
   *
   * @param {string|null} groupName - グループ名
   * @returns {HTMLElement[]} グループに属するトリガー要素配列
   */
  const getGroupTriggers = (groupName) => {
    if (!groupName) return [];
    return [
      ...document.querySelectorAll(
        `.${SELECTORS.trigger}[${DATA_ATTRS.group}="${groupName}"]`,
      ),
    ];
  };

  /**
   * 指定グループに属するモーダルID一覧を返す。
   *
   * トリガーの data-href 順をそのまま表示順として扱う。
   *
   * @param {string|null} groupName - グループ名
   * @returns {string[]} モーダルID配列
   */
  const getGroupModalIds = (groupName) => {
    return getGroupTriggers(groupName)
      .map((trigger) => trigger.dataset.href)
      .filter(Boolean);
  };

  /**
   * モーダル背景要素を生成する。
   *
   * @returns {HTMLDivElement} 背景要素
   */
  const createModalBg = () => {
    const modalBg = document.createElement("div");
    modalBg.className = SELECTORS.bg;
    return modalBg;
  };

  /**
   * 現在DOM上に存在する背景要素を取得する。
   *
   * この実装では背景は常に1つだけ存在する前提。
   *
   * @returns {HTMLElement|null} 背景要素
   */
  const getExistingBg = () => {
    return document.querySelector(`.${SELECTORS.bg}`);
  };

  /**
   * 方向付きアニメーション用クラスをすべて除去する。
   *
   * @param {HTMLElement|null} modalTarget - 対象モーダル要素
   * @returns {void}
   */
  const resetAnimationClasses = (modalTarget) => {
    if (!modalTarget) return;

    modalTarget.classList.remove(
      ANIMATION_CLASSES.openFromLeft,
      ANIMATION_CLASSES.openFromRight,
      ANIMATION_CLASSES.closeToLeft,
      ANIMATION_CLASSES.closeToRight,
    );
  };

  /**
   * 表示方向に応じた表示用アニメーションクラスを付与する。
   *
   * @param {HTMLElement|null} modalTarget - 対象モーダル要素
   * @param {"prev"|"next"|null} direction - 遷移方向
   * @returns {void}
   */
  const applyOpenDirectionClass = (modalTarget, direction) => {
    if (!modalTarget) return;

    if (direction === "next") {
      modalTarget.classList.add(ANIMATION_CLASSES.openFromRight);
    }

    if (direction === "prev") {
      modalTarget.classList.add(ANIMATION_CLASSES.openFromLeft);
    }
  };

  /**
   * 表示方向に応じた閉じ用アニメーションクラスを付与する。
   *
   * @param {HTMLElement|null} modalTarget - 対象モーダル要素
   * @param {"prev"|"next"|null} direction - 遷移方向
   * @returns {void}
   */
  const applyCloseDirectionClass = (modalTarget, direction) => {
    if (!modalTarget) return;

    if (direction === "next") {
      modalTarget.classList.add(ANIMATION_CLASSES.closeToLeft);
    }

    if (direction === "prev") {
      modalTarget.classList.add(ANIMATION_CLASSES.closeToRight);
    }
  };

  /**
   * 対象モーダルに前後ナビゲーションを生成する。
   *
   * すでに存在する場合は何もしない。
   * グループモーダルのみで使用する想定。
   *
   * @param {HTMLElement|null} modalTarget - 対象モーダル要素
   * @returns {void}
   */
  const ensureGroupNav = (modalTarget) => {
    if (!modalTarget) return;

    const hasNav = modalTarget.querySelector(`.${SELECTORS.nav}`);
    if (hasNav) return;

    const nav = document.createElement("div");
    nav.className = SELECTORS.nav;
    nav.innerHTML = `
      <button type="button" class="${SELECTORS.prev}" aria-label="前へ"></button>
      <button type="button" class="${SELECTORS.next}" aria-label="次へ"></button>
    `;

    modalTarget.appendChild(nav);
  };

  /**
   * 対象モーダルのナビゲーション表示状態を同期する。
   *
   * - グループモーダルなら前後ナビを生成
   * - 単体モーダルなら前後ナビを削除
   *
   * @param {HTMLElement|null} modalTarget - 対象モーダル要素
   * @returns {void}
   */
  const syncGroupNav = (modalTarget) => {
    if (!modalTarget) return;

    const { groupName } = currentModalState;
    const existingNav = modalTarget.querySelector(`.${SELECTORS.nav}`);

    if (!groupName) {
      if (existingNav) existingNav.remove();
      return;
    }

    ensureGroupNav(modalTarget);
  };

  /**
   * モーダルを開く。
   *
   * @param {HTMLElement|null} modalTarget - 開く対象のモーダル要素
   * @param {Object} [options={}] - オプション
   * @param {string|null} [options.modalId=null] - 開くモーダルID
   * @param {string|null} [options.groupName=null] - 属するグループ名
   * @param {boolean} [options.keepBg=false] - 既存背景を使い回すかどうか
   * @param {"prev"|"next"|null} [options.direction=null] - 遷移方向
   * @returns {void}
   */
  const openModal = (modalTarget, options = {}) => {
    if (!modalTarget) return;
    if (modalTarget.classList.contains(STATE_CLASSES.active)) return;

    const {
      modalId = null,
      groupName = null,
      keepBg = false,
      direction = null,
    } = options;

    const existingBg = getExistingBg();

    if (!keepBg && existingBg) {
      existingBg.remove();
    }

    currentModalState.modalId = modalId || modalTarget.id || null;
    currentModalState.groupName = groupName || null;

    syncGroupNav(modalTarget);

    modalTarget.classList.remove(STATE_CLASSES.closing);
    applyOpenDirectionClass(modalTarget, direction);
    modalTarget.classList.add(STATE_CLASSES.active);

    if (keepBg) {
      const modalBg = getExistingBg();
      if (modalBg) {
        modalBg.classList.add(STATE_CLASSES.keepBg);
        modalTarget.insertAdjacentElement("afterend", modalBg);
      }
    } else {
      const modalBg = createModalBg();
      modalTarget.insertAdjacentElement("afterend", modalBg);
    }

    document.body.classList.add(STATE_CLASSES.bodyOpen);
    updateGroupNavState(modalTarget);
  };

  /**
   * モーダルを閉じる。
   *
   * アニメーション完了は以下の3経路で保証する:
   * - animationend
   * - animationcancel
   * - fallback timeout
   *
   * これにより、連打やアニメーション中断時でも callback が未実行で止まりにくくする。
   *
   * @param {HTMLElement|null} modalTarget - 閉じる対象のモーダル要素
   * @param {Object} [options={}] - オプション
   * @param {boolean} [options.keepBg=false] - 背景を残すかどうか
   * @param {(closed: boolean) => void|null} [options.callback=null] - 完了後コールバック
   * @param {"prev"|"next"|null} [options.direction=null] - 遷移方向
   * @returns {void}
   */
  const closeModal = (modalTarget, options = {}) => {
    const { keepBg = false, callback = null, direction = null } = options;
    const animationSelector = modalTarget.querySelector(`.${SELECTORS.inner}`);

    if (!modalTarget) {
      if (typeof callback === "function") callback(false);
      return;
    }

    if (!modalTarget.classList.contains(STATE_CLASSES.active)) {
      if (typeof callback === "function") callback(false);
      return;
    }

    if (modalTarget.classList.contains(STATE_CLASSES.closing)) {
      if (typeof callback === "function") callback(false);
      return;
    }

    const modalBg = getExistingBg();
    const hasModalBg = !!modalBg;

    let finalized = false;

    /**
     * CSS の時間文字列を ms に変換する。
     *
     * @param {string} value - CSS時間文字列
     * @returns {number} ミリ秒
     */
    const parseTimeToMs = (value) => {
      if (!value) return 0;
      const firstValue = value.split(",")[0].trim();

      if (firstValue.endsWith("ms")) {
        return parseFloat(firstValue);
      }

      if (firstValue.endsWith("s")) {
        return parseFloat(firstValue) * 1000;
      }

      return 0;
    };

    /**
     * close 時に登録したイベントリスナーを解除する。
     *
     * @returns {void}
     */
    const cleanup = () => {
      animationSelector.removeEventListener(
        "animationend",
        handleAnimationFinish,
      );
      animationSelector.removeEventListener(
        "animationcancel",
        handleAnimationFinish,
      );
    };

    /**
     * モーダル終了処理を確定する。
     *
     * @param {boolean} closed - 正常に閉じた扱いにするかどうか
     * @returns {void}
     */
    const finalize = (closed) => {
      if (finalized) return;
      finalized = true;

      cleanup();

      modalTarget.classList.remove(STATE_CLASSES.active);
      modalTarget.classList.remove(STATE_CLASSES.closing);
      resetAnimationClasses(modalTarget);

      if (hasModalBg && !keepBg) {
        modalBg.remove();
      }

      if (hasModalBg && keepBg) {
        modalBg.classList.remove(STATE_CLASSES.closing);
      }

      if (!keepBg) {
        document.body.classList.remove(STATE_CLASSES.bodyOpen);
        currentModalState.modalId = null;
        currentModalState.groupName = null;
      }

      if (typeof callback === "function") {
        callback(closed);
      }
    };

    /**
     * モーダル本体のアニメーション終了時ハンドラ。
     *
     * @param {AnimationEvent} evt - animation イベント
     * @returns {void}
     */
    const handleAnimationFinish = (evt) => {
      if (evt.target !== modalTarget) return;
      finalize(true);
    };

    modalTarget.classList.add(STATE_CLASSES.closing);
    applyCloseDirectionClass(modalTarget, direction);

    if (hasModalBg && !keepBg) {
      modalBg.classList.add(STATE_CLASSES.closing);
    }

    animationSelector.addEventListener("animationend", handleAnimationFinish);
    animationSelector.addEventListener(
      "animationcancel",
      handleAnimationFinish,
    );

    const computedStyle = window.getComputedStyle(animationSelector);
    const fallbackMs =
      parseTimeToMs(computedStyle.animationDuration) +
      parseTimeToMs(computedStyle.animationDelay) +
      80;

    window.setTimeout(
      () => {
        finalize(true);
      },
      Math.max(fallbackMs, 80),
    );
  };

  /**
   * グループモーダルを前後に移動する。
   *
   * 現在の modalId を元にグループ配列上の前後インデックスを計算し、
   * 現在モーダルを閉じた後に次モーダルを開く。
   *
   * @param {"prev"|"next"} direction - 移動方向
   * @returns {void}
   */
  const moveGroupModal = (direction) => {
    if (isGroupTransitioning) return;

    const { modalId, groupName } = currentModalState;
    if (!modalId || !groupName) return;

    const groupModalIds = getGroupModalIds(groupName);
    if (!groupModalIds.length) return;

    const currentIndex = groupModalIds.indexOf(modalId);
    if (currentIndex === -1) return;

    let nextIndex;
    if (direction === "prev") {
      nextIndex =
        currentIndex === 0 ? groupModalIds.length - 1 : currentIndex - 1;
    } else {
      nextIndex =
        currentIndex === groupModalIds.length - 1 ? 0 : currentIndex + 1;
    }

    const nextModalId = groupModalIds[nextIndex];
    if (nextModalId === modalId) return;

    const currentModal = document.getElementById(modalId);
    const nextModal = document.getElementById(nextModalId);

    if (!currentModal || !nextModal) return;

    setGroupNavDisabled(currentModal, true);
    isGroupTransitioning = true;

    closeModal(currentModal, {
      keepBg: true,
      direction,
      callback: (closed) => {
        if (!closed) {
          setGroupNavDisabled(currentModal, false);
          isGroupTransitioning = false;
          return;
        }

        openModal(nextModal, {
          modalId: nextModalId,
          groupName,
          keepBg: true,
          direction,
        });

        setGroupNavDisabled(nextModal, false);
        isGroupTransitioning = false;
      },
    });
  };

  /**
   * グループナビの表示・活性状態を更新する。
   *
   * グループ件数が1件以下なら prev / next を hidden + disabled にする。
   *
   * @param {HTMLElement|null} modalTarget - 対象モーダル要素
   * @returns {void}
   */
  const updateGroupNavState = (modalTarget) => {
    if (!modalTarget) return;

    const prevButton = modalTarget.querySelector(`.${SELECTORS.prev}`);
    const nextButton = modalTarget.querySelector(`.${SELECTORS.next}`);

    const { groupName } = currentModalState;
    const groupModalIds = groupName ? getGroupModalIds(groupName) : [];
    const canMove = groupModalIds.length > 1;

    if (prevButton) {
      prevButton.hidden = !canMove;
      prevButton.disabled = !canMove;
    }

    if (nextButton) {
      nextButton.hidden = !canMove;
      nextButton.disabled = !canMove;
    }
  };

  /**
   * グループナビボタンの disabled 状態を切り替える。
   *
   * 主にグループモーダル切替中の連打防止に使用する。
   *
   * @param {HTMLElement|null} modalTarget - 対象モーダル要素
   * @param {boolean} disabled - 無効化するかどうか
   * @returns {void}
   */
  const setGroupNavDisabled = (modalTarget, disabled) => {
    if (!modalTarget) return;

    const prevButton = modalTarget.querySelector(`.${SELECTORS.prev}`);
    const nextButton = modalTarget.querySelector(`.${SELECTORS.next}`);

    if (prevButton) prevButton.disabled = disabled;
    if (nextButton) nextButton.disabled = disabled;
  };

  /**
   * クリックイベントを一括で委譲処理する。
   *
   * 対応対象:
   * - モーダルトリガー
   * - 閉じるボタン
   * - prev ボタン
   * - next ボタン
   * - 背景クリック
   */
  document.addEventListener("click", (evt) => {
    const trigger = evt.target.closest(`.${SELECTORS.trigger}`);
    if (trigger) {
      evt.preventDefault();

      const modalId = trigger.dataset.href;
      if (!modalId) return;

      const modalTarget = document.getElementById(modalId);
      const groupName = trigger.dataset.modalGroup || null;

      openModal(modalTarget, {
        modalId,
        groupName,
      });
      return;
    }

    const closeButton = evt.target.closest(`.${SELECTORS.close}`);
    if (closeButton) {
      evt.preventDefault();
      const modalTarget = closeButton.closest(`.${STATE_CLASSES.active}`);
      closeModal(modalTarget);
      return;
    }

    const prevButton = evt.target.closest(`.${SELECTORS.prev}`);
    if (prevButton) {
      evt.preventDefault();
      moveGroupModal("prev");
      return;
    }

    const nextButton = evt.target.closest(`.${SELECTORS.next}`);
    if (nextButton) {
      evt.preventDefault();
      moveGroupModal("next");
      return;
    }

    const modalBg = evt.target.closest(`.${SELECTORS.bg}`);
    if (modalBg) {
      const modalTarget = modalBg.previousElementSibling;
      closeModal(modalTarget);
    }
  });
}

/**
 * DOM 構築完了後にモーダル機能を初期化する。
 */
window.addEventListener("DOMContentLoaded", () => {
  modal();
});
