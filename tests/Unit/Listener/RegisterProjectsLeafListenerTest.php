<?php

namespace Unit\Listener;

use OCA\OpenRegister\Event\RegisterLeafProvidersEvent;
use OCA\OpenRegister\Service\Integration\LeafDescriptor;
use OCA\Planninq\Listener\RegisterProjectsLeafListener;
use OCP\EventDispatcher\Event;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * ADR-066 — the server half of the `planninq-projects` leaf.
 *
 * The two halves of a leaf are bound by a shared id and a set of fields that
 * must match exactly. scripts/check-integration-parity.js compares them by
 * reading both files, so what is left for a unit test is the behaviour that
 * static comparison cannot see: that the descriptor is actually contributed,
 * that it is contributed with no provider (render-and-read only, ADR-066
 * decision 2), and that a failure in here costs only this leaf.
 */
class RegisterProjectsLeafListenerTest extends TestCase {
	private IL10N $l10n;
	private LoggerInterface $logger;

	protected function setUp(): void {
		$this->l10n = $this->createMock(IL10N::class);
		$this->l10n->method('t')->willReturnArgument(0);
		$this->logger = $this->createMock(LoggerInterface::class);
	}

	private function listener(): RegisterProjectsLeafListener {
		return new RegisterProjectsLeafListener($this->l10n, $this->logger);
	}

	public function testContributesExactlyOneLeaf(): void {
		$event = new RegisterLeafProvidersEvent();

		$this->listener()->handle($event);

		$this->assertCount(1, $event->getLeaves());
	}

	public function testTheDescriptorCarriesTheSharedId(): void {
		$event = new RegisterLeafProvidersEvent();

		$this->listener()->handle($event);

		$descriptor = $event->getLeaves()[0]['descriptor'];
		$this->assertSame('planninq-projects', $descriptor->getId());
		$this->assertSame(RegisterProjectsLeafListener::LEAF_ID, $descriptor->getId());
	}

	/**
	 * ADR-066 decision 2: a leaf is render-and-read, so it exposes no provider.
	 *
	 * A provider here would be an app-local store OpenRegister calls into, which
	 * is exactly the cross-app command channel the ADR keeps closed.
	 */
	public function testContributesNoProvider(): void {
		$event = new RegisterLeafProvidersEvent();

		$this->listener()->handle($event);

		$this->assertNull($event->getLeaves()[0]['provider']);
		$this->assertSame(
			[LeafDescriptor::KIND_RENDER_SURFACE],
			$event->getLeaves()[0]['descriptor']->getKinds()
		);
	}

	/**
	 * The leaf cannot render where planninq is absent, which is the whole reason
	 * it exists rather than a consuming app querying planninq's register.
	 */
	public function testTheDescriptorRequiresPlanninq(): void {
		$event = new RegisterLeafProvidersEvent();

		$this->listener()->handle($event);

		$this->assertSame('planninq', $event->getLeaves()[0]['descriptor']->getRequiredApp());
	}

	/**
	 * A Vue 3 leaf under a possibly Vue 2.7 host renders blank unless both halves
	 * agree on the mount hand-off, and the failure is silent.
	 */
	public function testTheDescriptorDeclaresTheMountRenderMode(): void {
		$event = new RegisterLeafProvidersEvent();

		$this->listener()->handle($event);

		$this->assertSame(
			LeafDescriptor::RENDER_MODE_MOUNT,
			$event->getLeaves()[0]['descriptor']->getRenderMode()
		);
	}

	/**
	 * AD-18: this marker is what turns shillinq's `projectId` from a bare uuid
	 * into the project itself.
	 *
	 * It MUST be the integration id. PropertyReferenceTypeValidator resolves a
	 * property's marker through IntegrationRegistry::isValidIntegrationId() and
	 * throws on a miss, so a loose semantic word like 'project' is a schema that
	 * fails to import the day that validator is wired into the import path.
	 */
	public function testTheReferenceTypeIsTheIntegrationId(): void {
		$event = new RegisterLeafProvidersEvent();

		$this->listener()->handle($event);

		$descriptor = $event->getLeaves()[0]['descriptor'];
		$this->assertSame('planninq-projects', $descriptor->getReferenceType());
		$this->assertSame($descriptor->getId(), $descriptor->getReferenceType());
	}

	/**
	 * Written out on both halves rather than left to a default — a set the gate
	 * can compare against the JS half.
	 */
	public function testTheDescriptorWritesItsSurfacesOut(): void {
		$event = new RegisterLeafProvidersEvent();

		$this->listener()->handle($event);

		$this->assertSame(
			['user-dashboard', 'app-dashboard', 'detail-page', 'single-entity'],
			$event->getLeaves()[0]['descriptor']->getSurfaces()
		);
	}

	/**
	 * The listener is subscribed by event NAME, so nothing stops another event
	 * reaching it. It must not assume the type it was registered for.
	 */
	public function testIgnoresAnEventItDoesNotUnderstand(): void {
		$this->logger->expects($this->never())->method('warning');

		$this->listener()->handle(new Event());

		$this->addToAssertionCount(1);
	}

	/**
	 * A throwing leaf must cost only its own leaf, never the catalogue.
	 */
	public function testALabelFailureIsLoggedAndSwallowed(): void {
		$l10n = $this->createMock(IL10N::class);
		$l10n->method('t')->willThrowException(new \RuntimeException('no catalogue'));
		$this->logger->expects($this->once())->method('warning');

		$event = new RegisterLeafProvidersEvent();
		(new RegisterProjectsLeafListener($l10n, $this->logger))->handle($event);

		$this->assertSame([], $event->getLeaves());
	}
}
