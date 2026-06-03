/**
 * BasePortalParser - interface all portal parsers must implement.
 * Each method operates directly on the live DOM.
 */
class BasePortalParser {
  /** @returns {string} Human-readable portal name */
  get name() { return 'Generic'; }

  /**
   * Returns true if this parser handles the current page.
   * @param {string} hostname
   * @param {Document} doc
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  matches(hostname, doc) { return false; }

  /**
   * Scrape all application form fields from the page.
   * @param {Document} doc
   * @returns {Array<FieldDescriptor>}
   *
   * FieldDescriptor shape:
   * {
   *   label: string,       // human-readable question text
   *   type: string,        // 'text'|'email'|'tel'|'textarea'|'select'|'radio'|'checkbox'
   *   name: string|null,   // form field name attribute
   *   id: string|null,
   *   required: boolean,
   *   options: string[]|null,  // for select/radio
   *   placeholder: string|null,
   *   currentValue: string|null,
   *   _el: Element|null,   // live DOM reference for injection (stripped before sending to backend)
   * }
   */
  // eslint-disable-next-line no-unused-vars
  scrapeFields(doc) { return []; }

  /**
   * Inject a single answer into the correct field.
   * @param {string} label   - field label to match
   * @param {string} answer  - value to inject
   * @param {Document} doc
   * @returns {boolean} true if successfully filled
   */
  // eslint-disable-next-line no-unused-vars
  injectAnswer(label, answer, doc) { return false; }
}

module.exports = BasePortalParser;
