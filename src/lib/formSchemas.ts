import * as yup from 'yup';

export interface CustomerFormValues {
  name: string;
  contact: string;
  address: string;
  email: string;
}

export interface TripFormValues {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  cutoffDate: string;
  checkedKg: string;
  cabinKg: string;
  feePct: string;
  feePerKg: string;
}

export interface OrderItemFormValues {
  name: string;
  cost: string;
  qty: string;
  photoUri: string | null;
}

export interface OrderFormValues {
  buyerId: string;
  weightKg: string;
  items: OrderItemFormValues[];
}

export interface EditOrderItemFormValues {
  name: string;
  cost: string;
  qty: string;
  photoUri: string | null;
}

function isValidISODate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

const requiredNumber = yup
  .string()
  .trim()
  .required('Required')
  .test('valid-number', 'Enter a valid number greater than or equal to 0', (value) =>
    value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  );

export const customerValidationSchema: yup.ObjectSchema<CustomerFormValues> = yup.object({
  name: yup.string().trim().required('Name is required'),
  contact: yup.string().trim().required('Contact is required'),
  address: yup.string().trim().required('Address is required'),
  email: yup.string().trim().email('Enter a valid email').required('Email is required'),
});

export const tripValidationSchema: yup.ObjectSchema<TripFormValues> = yup.object({
  origin: yup.string().trim().required('Origin is required'),
  destination: yup.string().trim().required('Destination is required'),
  departDate: yup
    .string()
    .required('Departure date is required')
    .test('valid-date', 'Select a valid departure date', isValidISODate),
  returnDate: yup
    .string()
    .required('Return date is required')
    .test('valid-date', 'Select a valid return date', isValidISODate)
    .test('after-departure', 'Return date must be on or after departure', function (value) {
      const { departDate } = this.parent as TripFormValues;
      return !isValidISODate(value) || !isValidISODate(departDate) || value >= departDate;
    }),
  cutoffDate: yup
    .string()
    .required('Cutoff date is required')
    .test('valid-date', 'Select a valid cutoff date', isValidISODate)
    .test('before-departure', 'Cutoff must be on or before departure', function (value) {
      const { departDate } = this.parent as TripFormValues;
      return !isValidISODate(value) || !isValidISODate(departDate) || value <= departDate;
    }),
  checkedKg: requiredNumber,
  cabinKg: requiredNumber,
  feePct: requiredNumber,
  feePerKg: requiredNumber,
});

export const orderValidationSchema: yup.ObjectSchema<OrderFormValues> = yup.object({
  buyerId: yup.string().required('Select a customer'),
  // Formik turns '' into undefined before validating; default it back so a blank weight is allowed.
  weightKg: yup.string().trim().default('').test(
    'valid-order-weight',
    'Enter a valid weight of 0 or greater',
    (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0)
  ),
  items: yup
    .array()
    .of(yup.object({
      name: yup.string().trim().required('Item name is required'),
      cost: yup.string().trim().required('Cost is required').test(
        'positive-cost',
        'Cost must be greater than 0',
        (value) => value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0
      ),
      qty: yup.string().trim().required('Quantity is required').test(
        'positive-quantity',
        'Quantity must be a whole number of at least 1',
        (value) => value !== undefined && Number.isInteger(Number(value)) && Number(value) >= 1
      ),
      photoUri: yup.string().nullable().defined(),
    }))
    .min(1, 'Add at least one item')
    .required('Add at least one item'),
});

export const editOrderItemValidationSchema: yup.ObjectSchema<EditOrderItemFormValues> = yup.object({
  name: yup.string().trim().required('Item name is required'),
  cost: yup.string().trim().required('Cost is required').test(
    'positive-cost',
    'Cost must be greater than 0',
    (value) => value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0
  ),
  qty: yup.string().trim().required('Quantity is required').test(
    'positive-quantity',
    'Quantity must be a whole number of at least 1',
    (value) => value !== undefined && Number.isInteger(Number(value)) && Number(value) >= 1
  ),
  photoUri: yup.string().nullable().defined(),
});