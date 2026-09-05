export type CheckoutPaymentRequest = {
  checkoutSessionId: string;
  orderId: string;
  amountSen: number;
  currency: 'MYR';
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  returnUrl: string;
  callbackUrl: string;
};

export type CheckoutPaymentSession = {
  provider: 'toyyibpay';
  providerPaymentId: string;
  actionUrl: string;
};

export type CheckoutPaymentStatus = 'pending' | 'succeeded' | 'failed';

export interface CheckoutPaymentProvider {
  readonly name: 'toyyibpay';
  isConfigured(): boolean;
  createPayment(input: CheckoutPaymentRequest): Promise<CheckoutPaymentSession>;
  getPaymentStatus(providerPaymentId: string): Promise<CheckoutPaymentStatus>;
}
