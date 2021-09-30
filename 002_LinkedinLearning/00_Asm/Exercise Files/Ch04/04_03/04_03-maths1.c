#include <stdio.h>

int add(int a, int b);
int subtract(int a, int b);
int multiply(int a, int b);
float divide(float a, float b);

int main()
{
	const int a = 5, b = 13;

	/* addition */
	printf("%d + %d = %d\n",
			a,
			b,
			add(a,b)
		  );

	/* subtraction */
	printf("%d - %d = %d\n",
			a,
			b,
			subtract(a,b)
		  );

	/* multiplication */
	printf("%d * %d = %d\n",
			a,
			b,
			multiply(a,b)
		  );

	/* division */
	printf("%d / %d = %f\n",
			a,
			b,
			divide((float)a,(float)b)
		  );

	return 0;
}
