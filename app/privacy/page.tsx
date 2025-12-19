export const metadata = {
  title: 'Privacy Policy - Sync Squid',
  description: 'Privacy Policy for Sync Squid video scheduling application',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-4xl font-bold text-gray-900">Privacy Policy</h1>
        
        <div className="space-y-6 text-gray-700">
          <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">1. Introduction</h2>
            <p className="mb-4">
              Sync Squid ("we", "our", or "us") is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you use our video scheduling application ("Service").
            </p>
            <p>
              By using our Service, you agree to the collection and use of information in
              accordance with this policy. If you do not agree with our policies and practices,
              do not use our Service.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              2. Information We Collect
            </h2>
            <h3 className="mb-2 text-xl font-semibold text-gray-900">2.1 Personal Information</h3>
            <p className="mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>Account information (email address, name)</li>
              <li>Video content and metadata (titles, descriptions, tags, scheduling information)</li>
              <li>Platform connection credentials (OAuth tokens for YouTube, Facebook, Instagram, TikTok)</li>
            </ul>

            <h3 className="mb-2 text-xl font-semibold text-gray-900">2.2 Automatically Collected Information</h3>
            <p className="mb-4">
              When you use our Service, we automatically collect certain information, including:
            </p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>Usage data and analytics</li>
              <li>Device information</li>
              <li>Log data (IP address, browser type, access times)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">3. How We Use Your Information</h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>Provide, maintain, and improve our Service</li>
              <li>Process and schedule your video uploads to social media platforms</li>
              <li>Authenticate and manage your connections to third-party platforms</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Monitor and analyze usage patterns</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              4. Legal Basis for Processing (GDPR)
            </h2>
            <p className="mb-4">
              Under the General Data Protection Regulation (GDPR), we process your personal
              data based on the following legal bases:
            </p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>
                <strong>Contractual necessity:</strong> Processing is necessary to perform the
                contract with you (providing the video scheduling service)
              </li>
              <li>
                <strong>Legitimate interests:</strong> Processing is necessary for our legitimate
                interests (improving our Service, preventing fraud)
              </li>
              <li>
                <strong>Consent:</strong> You have given consent for specific processing
                activities (OAuth connections to social media platforms)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              5. Data Sharing and Disclosure
            </h2>
            <p className="mb-4">We share your information in the following circumstances:</p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>
                <strong>Third-party platforms:</strong> We transmit your video content and
                metadata to the social media platforms you connect (YouTube, Facebook,
                Instagram, TikTok) in accordance with your instructions
              </li>
              <li>
                <strong>Service providers:</strong> We may share data with service providers who
                perform services on our behalf (hosting, analytics)
              </li>
              <li>
                <strong>Legal requirements:</strong> We may disclose information if required by
                law or in response to valid legal requests
              </li>
            </ul>
            <p className="mb-4">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">6. Data Storage and Security</h2>
            <p className="mb-4">
              We implement appropriate technical and organizational measures to protect your
              personal data:
            </p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>Encryption of data in transit and at rest</li>
              <li>Secure authentication and access controls</li>
              <li>Regular security assessments</li>
              <li>Limited access to personal data on a need-to-know basis</li>
            </ul>
            <p className="mb-4">
              Your data is stored on secure servers provided by Supabase and Vercel. Video files
              are temporarily stored in Supabase Storage during upload and are automatically
              deleted after successful upload to target platforms.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">7. Your Rights (GDPR)</h2>
            <p className="mb-4">
              Under GDPR, you have the following rights regarding your personal data:
            </p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>
                <strong>Right of access:</strong> You can request a copy of your personal data
              </li>
              <li>
                <strong>Right to rectification:</strong> You can request correction of inaccurate
                data
              </li>
              <li>
                <strong>Right to erasure:</strong> You can request deletion of your personal data
              </li>
              <li>
                <strong>Right to restrict processing:</strong> You can request limitation of data
                processing
              </li>
              <li>
                <strong>Right to data portability:</strong> You can request your data in a
                machine-readable format
              </li>
              <li>
                <strong>Right to object:</strong> You can object to certain processing
                activities
              </li>
              <li>
                <strong>Right to withdraw consent:</strong> You can withdraw consent at any time
              </li>
            </ul>
            <p className="mb-4">
              To exercise these rights, please contact us using the information provided in the
              "Contact Us" section below.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">8. Data Retention</h2>
            <p className="mb-4">
              We retain your personal data only for as long as necessary to fulfill the purposes
              outlined in this Privacy Policy, unless a longer retention period is required by
              law:
            </p>
            <ul className="mb-4 ml-6 list-disc space-y-2">
              <li>Account information: Retained while your account is active</li>
              <li>Video metadata: Retained to maintain your scheduling history</li>
              <li>OAuth tokens: Retained to maintain platform connections</li>
              <li>Video files: Deleted immediately after successful upload to platforms</li>
            </ul>
            <p>
              Upon account deletion, we will delete or anonymize your personal data within 30
              days, except where we are required to retain it for legal purposes.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">9. International Data Transfers</h2>
            <p className="mb-4">
              Your information may be transferred to and processed in countries other than your
              country of residence. These countries may have data protection laws that differ
              from those in your country.
            </p>
            <p>
              We ensure that appropriate safeguards are in place for such transfers, including
              standard contractual clauses approved by the European Commission where applicable.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">10. Children's Privacy</h2>
            <p>
              Our Service is not intended for individuals under the age of 16. We do not
              knowingly collect personal information from children under 16. If you become aware
              that a child has provided us with personal information, please contact us, and we
              will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">11. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any
              changes by posting the new Privacy Policy on this page and updating the "Last
              updated" date. You are advised to review this Privacy Policy periodically for
              any changes.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">12. Contact Us</h2>
            <p className="mb-4">
              If you have any questions about this Privacy Policy or wish to exercise your
              rights under GDPR, please contact us:
            </p>
            <div className="rounded-lg bg-gray-100 p-4">
              <p className="font-semibold">Sync Squid</p>
              <p>Email: privacy@syncsquid.com</p>
              <p className="mt-2 text-sm text-gray-600">
                Note: Please replace the email address above with your actual contact email.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">13. Supervisory Authority</h2>
            <p>
              If you are located in the European Economic Area (EEA) and believe we have not
              addressed your concerns, you have the right to lodge a complaint with your local
              data protection supervisory authority.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

